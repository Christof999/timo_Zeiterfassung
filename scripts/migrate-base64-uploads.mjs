#!/usr/bin/env node
/**
 * Migration: Base64-Fotos aus Firestore (fileUploads) nach Firebase Storage.
 *
 * Hintergrund: Bei Storage-Upload-Fehlern speicherte die App Fotos als Base64
 * direkt im Firestore-Dokument (bis ~1 MB pro Dokument). Das macht Reads teuer
 * und langsam. Dieses Skript lädt die Binärdaten nach Storage hoch, trägt
 * filePath (Download-URL) + storagePath am Dokument nach und entfernt die
 * Base64-Felder. Der Lesepfad der App unterstützt beide Varianten, die
 * Migration ist daher jederzeit und schrittweise möglich.
 *
 * Voraussetzungen (Umgebungsvariablen, wie bei den Vercel-Functions):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   FIREBASE_STORAGE_BUCKET   (z. B. <projekt-id>.appspot.com)
 *
 * Aufruf:
 *   node scripts/migrate-base64-uploads.mjs             # Dry-Run (zeigt nur an)
 *   node scripts/migrate-base64-uploads.mjs --apply     # führt die Migration aus
 *   node scripts/migrate-base64-uploads.mjs --apply --limit=50
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : Infinity

const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_STORAGE_BUCKET'
]
const missing = requiredEnv.filter((name) => !process.env[name])
if (missing.length > 0) {
  console.error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`)
  process.exit(1)
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
})

const db = getFirestore()
const bucket = getStorage().bucket()

const BASE64_FIELDS = ['base64Data', 'base64String', 'base64', 'base64DataUrl']

function extractBase64(data) {
  for (const field of BASE64_FIELDS) {
    const value = data[field]
    if (typeof value === 'string' && value.length > 100) {
      // data:-URL → nur den Base64-Teil verwenden
      if (value.startsWith('data:')) {
        const parts = value.split(',')
        if (parts.length > 1) return { field, base64: parts[1] }
        continue
      }
      return { field, base64: value }
    }
  }
  return null
}

function resolveMimeType(data) {
  let mime = String(data.mimeType || data.contentType || '')
  if (mime.startsWith('data:')) {
    const match = mime.match(/^data:([^;,]+)/)
    mime = match ? match[1] : ''
  }
  return mime && mime.includes('/') ? mime : 'image/jpeg'
}

function buildObjectPath(data, docId, mime) {
  const projectId = String(data.projectId || 'unbekannt').replace(/[^a-zA-Z0-9._-]/g, '_')
  const employeeId = String(data.employeeId || 'unbekannt').replace(/[^a-zA-Z0-9._-]/g, '_')
  const type = String(data.fileType || data.type || 'construction_site')
  const rawName = String(data.fileName || data.name || `${docId}.jpg`)
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.jpg'
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const nameWithExt = /\.[a-zA-Z0-9]+$/.test(safeName) ? safeName : `${safeName}.${ext}`
  // Gleiches Schema wie der Client (buildStorageObjectPath in dataService.ts)
  return `uploads/${projectId}/${employeeId}/${Date.now()}_${type}_${nameWithExt}`
}

async function migrate() {
  console.log(`Modus: ${APPLY ? 'APPLY (schreibt!)' : 'DRY-RUN (nur anzeigen)'}${Number.isFinite(LIMIT) ? `, Limit: ${LIMIT}` : ''}`)

  const snapshot = await db.collection('fileUploads').get()
  console.log(`fileUploads gesamt: ${snapshot.size}`)

  let candidates = 0
  let migrated = 0
  let skippedHasUrl = 0
  let failed = 0
  let totalBytes = 0

  for (const docSnap of snapshot.docs) {
    if (migrated >= LIMIT) break
    const data = docSnap.data()

    const found = extractBase64(data)
    if (!found) continue

    // Bereits in Storage? Dann nur die Base64-Reste entfernen.
    const hasStorageUrl =
      (typeof data.filePath === 'string' && data.filePath.startsWith('http')) ||
      (typeof data.url === 'string' && data.url.startsWith('http')) ||
      (typeof data.storagePath === 'string' && data.storagePath.trim())

    candidates++
    const sizeKb = Math.round((found.base64.length * 3) / 4 / 1024)
    totalBytes += (found.base64.length * 3) / 4

    if (hasStorageUrl) {
      skippedHasUrl++
      console.log(`~ ${docSnap.id}: hat bereits Storage-URL, entferne nur Base64 (${sizeKb} KB) [${found.field}]`)
      if (APPLY) {
        const cleanup = {}
        for (const f of BASE64_FIELDS) if (f in data) cleanup[f] = FieldValue.delete()
        await docSnap.ref.update(cleanup)
      }
      continue
    }

    const mime = resolveMimeType(data)
    const objectPath = buildObjectPath(data, docSnap.id, mime)
    console.log(`> ${docSnap.id}: ${sizeKb} KB (${mime}) → ${objectPath}`)

    if (!APPLY) {
      migrated++
      continue
    }

    try {
      const buffer = Buffer.from(found.base64, 'base64')
      const token = randomUUID()
      const file = bucket.file(objectPath)
      await file.save(buffer, {
        contentType: mime,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } }
      })
      // Download-URL im selben Format wie das Firebase-Web-SDK
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`

      const update = {
        filePath: downloadUrl,
        storagePath: objectPath,
        mimeType: mime,
        base64MigratedAt: new Date()
      }
      for (const f of BASE64_FIELDS) if (f in data) update[f] = FieldValue.delete()
      await docSnap.ref.update(update)
      migrated++
    } catch (error) {
      failed++
      console.error(`! ${docSnap.id}: Migration fehlgeschlagen:`, error.message || error)
    }
  }

  console.log('')
  console.log(`Kandidaten mit Base64: ${candidates} (${Math.round(totalBytes / 1024 / 1024)} MB)`)
  console.log(`  davon nur bereinigt (hatten schon URL): ${skippedHasUrl}`)
  console.log(`  ${APPLY ? 'migriert' : 'würden migriert'}: ${migrated}`)
  if (failed > 0) console.log(`  fehlgeschlagen: ${failed}`)
  if (!APPLY) console.log('\nZum Ausführen: node scripts/migrate-base64-uploads.mjs --apply')
}

migrate().catch((error) => {
  console.error('Migration abgebrochen:', error)
  process.exit(1)
})
