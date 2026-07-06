import {
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebaseConfig'
import { authReady } from './shared'

// Selbstheilung für Foto-Uploads:
// Bei schlechtem Netz speichert die App Fotos notfalls als Base64 direkt in
// Firestore (markiert mit needsStorageMigration). Diese Wartungslogik
// verschiebt solche Fotos automatisch nach Firebase Storage, sobald ein Admin
// das Dashboard öffnet — es ist kein manueller Eingriff und kein Terminal
// nötig. Pendant für die Kommandozeile: scripts/migrate-base64-uploads.mjs.

const BASE64_FIELDS = ['base64Data', 'base64String', 'base64', 'base64DataUrl'] as const

/** Einmal pro Gerät: kompletter Bestands-Durchlauf (fängt Alt-Fotos ohne Markierung ab). */
const FULL_SWEEP_DONE_KEY = 'zeiterfassung_base64_full_sweep_done_v1'

export interface Base64MigrationProgress {
  /** Bisher geprüfte Dokumente */
  scanned: number
  /** Dokumente insgesamt */
  total: number
  /** Nach Storage hochgeladen */
  migrated: number
  /** Nur bereinigt (hatten bereits eine Storage-URL) */
  cleaned: number
  /** Fehlgeschlagen (Base64 bleibt erhalten) */
  failed: number
  /** Freigewordene Firestore-Bytes (geschätzt) */
  freedBytes: number
}

export interface Base64MigrationResult extends Base64MigrationProgress {
  done: true
}

function emptyProgress(total: number): Base64MigrationProgress {
  return { scanned: 0, total, migrated: 0, cleaned: 0, failed: 0, freedBytes: 0 }
}

function extractBase64(data: Record<string, unknown>): { field: string; base64: string } | null {
  for (const field of BASE64_FIELDS) {
    const value = data[field]
    if (typeof value === 'string' && value.length > 100) {
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

function resolveMimeType(data: Record<string, unknown>): string {
  let mime = String(data.mimeType || data.contentType || '')
  if (mime.startsWith('data:')) {
    const match = mime.match(/^data:([^;,]+)/)
    mime = match ? match[1] : ''
  }
  // Storage-Rules erlauben nur image/* — der Base64-Fallback war immer ein Bild.
  return mime.startsWith('image/') ? mime : 'image/jpeg'
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

function buildObjectPath(data: Record<string, unknown>, docId: string, mime: string): string {
  const clean = (v: unknown, fallback: string) =>
    String(v || fallback).replace(/[^a-zA-Z0-9._-]/g, '_')
  const projectId = clean(data.projectId, 'unbekannt')
  const employeeId = clean(data.employeeId, 'unbekannt')
  const type = String(data.fileType || data.type || 'construction_site')
  const rawName = String(data.fileName || data.name || `${docId}.jpg`)
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.jpg'
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const nameWithExt = /\.[a-zA-Z0-9]+$/.test(safeName) ? safeName : `${safeName}.${ext}`
  // Gleiches Schema wie beim regulären Upload (buildStorageObjectPath)
  return `uploads/${projectId}/${employeeId}/${Date.now()}_${type}_${nameWithExt}`
}

/**
 * Migriert EIN fileUploads-Dokument: lädt Base64-Daten nach Storage hoch (falls
 * nötig) und entfernt die Base64-Felder samt needsStorageMigration-Markierung.
 * Aktualisiert progress in-place.
 */
async function migrateUploadDoc(
  docSnap: QueryDocumentSnapshot<DocumentData>,
  progress: Base64MigrationProgress
): Promise<void> {
  const data = docSnap.data() as Record<string, unknown>
  const found = extractBase64(data)

  const clearFlags = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const update: Record<string, unknown> = { ...extra }
    for (const f of BASE64_FIELDS) if (f in data) update[f] = deleteField()
    if ('needsStorageMigration' in data) update.needsStorageMigration = deleteField()
    return update
  }

  if (!found) {
    // Keine Base64-Daten (mehr) — ggf. nur die Markierung entfernen.
    if ('needsStorageMigration' in data) {
      await updateDoc(doc(db, 'fileUploads', docSnap.id), clearFlags())
    }
    return
  }

  const approxBytes = Math.round((found.base64.length * 3) / 4)
  const hasStorageUrl =
    (typeof data.filePath === 'string' && data.filePath.startsWith('http')) ||
    (typeof data.url === 'string' && data.url.startsWith('http')) ||
    (typeof data.storagePath === 'string' && String(data.storagePath).trim() !== '')

  try {
    if (hasStorageUrl) {
      // Bild liegt schon in Storage → nur die Base64-Reste entfernen
      await updateDoc(doc(db, 'fileUploads', docSnap.id), clearFlags())
      progress.cleaned++
      progress.freedBytes += approxBytes
    } else {
      const mime = resolveMimeType(data)
      const objectPath = buildObjectPath(data, docSnap.id, mime)
      const blob = base64ToBlob(found.base64, mime)
      const objectRef = storageRef(storage, objectPath)
      await uploadBytes(objectRef, blob, { contentType: mime })
      const downloadUrl = await getDownloadURL(objectRef)

      await updateDoc(
        doc(db, 'fileUploads', docSnap.id),
        clearFlags({
          filePath: downloadUrl,
          storagePath: objectPath,
          mimeType: mime,
          base64MigratedAt: new Date()
        })
      )
      progress.migrated++
      progress.freedBytes += approxBytes
    }
  } catch (error) {
    progress.failed++
    console.error(`Base64-Migration für ${docSnap.id} fehlgeschlagen:`, error)
  }
}

/**
 * Kompletter Bestands-Durchlauf über alle fileUploads (liest die ganze
 * Collection — bewusst nur für die einmalige Alt-Migration gedacht).
 */
export async function migrateBase64UploadsToStorage(
  onProgress?: (progress: Base64MigrationProgress) => void,
  shouldContinue?: () => boolean
): Promise<Base64MigrationResult> {
  await authReady

  const snapshot = await getDocs(collection(db, 'fileUploads'))
  const progress = emptyProgress(snapshot.size)

  for (const docSnap of snapshot.docs) {
    if (shouldContinue && !shouldContinue()) break
    progress.scanned++
    await migrateUploadDoc(docSnap, progress)
    if (progress.scanned % 10 === 0) onProgress?.({ ...progress })
  }

  onProgress?.({ ...progress })
  return { ...progress, done: true }
}

/**
 * Selbstheilung, läuft still beim Öffnen des Admin-Dashboards:
 * 1. Verschiebt alle als needsStorageMigration markierten Notfall-Fotos
 *    (Base64-Fallback bei schlechtem Netz) nach Storage — sehr günstig,
 *    weil gezielt nur markierte Dokumente geladen werden.
 * 2. Einmal pro Gerät zusätzlich ein kompletter Bestands-Durchlauf, um
 *    Alt-Fotos ohne Markierung (oder eine abgebrochene manuelle Migration)
 *    abzuräumen.
 */
export async function runUploadSelfHealing(): Promise<void> {
  await authReady

  try {
    const flagged = await getDocs(
      query(collection(db, 'fileUploads'), where('needsStorageMigration', '==', true))
    )
    if (!flagged.empty) {
      const progress = emptyProgress(flagged.size)
      for (const docSnap of flagged.docs) {
        progress.scanned++
        await migrateUploadDoc(docSnap, progress)
      }
      if (progress.migrated + progress.cleaned > 0) {
        console.info(
          `Foto-Selbstheilung: ${progress.migrated} Foto(s) nach Storage verschoben, ` +
            `${progress.cleaned} bereinigt (${Math.round(progress.freedBytes / 1024)} KB freigegeben).`
        )
      }
    }
  } catch (error) {
    console.warn('Foto-Selbstheilung (markierte Uploads) übersprungen:', error)
  }

  try {
    if (localStorage.getItem(FULL_SWEEP_DONE_KEY) === '1') return
    const result = await migrateBase64UploadsToStorage()
    if (result.failed === 0) {
      localStorage.setItem(FULL_SWEEP_DONE_KEY, '1')
    }
    if (result.migrated + result.cleaned > 0) {
      console.info(
        `Foto-Bestandsmigration: ${result.migrated} Foto(s) nach Storage verschoben, ` +
          `${result.cleaned} bereinigt (${(result.freedBytes / 1024 / 1024).toFixed(1)} MB freigegeben).`
      )
    }
  } catch (error) {
    console.warn('Foto-Bestandsmigration übersprungen:', error)
  }
}
