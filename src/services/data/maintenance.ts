import { collection, deleteField, doc, getDocs, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebaseConfig'
import { authReady } from './shared'

// Wartungsfunktionen fürs Admin-Panel — bewusst so gebaut, dass sie ohne
// Terminal/CLI direkt aus der App laufen (Firebase-Web-SDK, keine Admin-Rechte
// nötig). Pendant für die Kommandozeile: scripts/migrate-base64-uploads.mjs.

const BASE64_FIELDS = ['base64Data', 'base64String', 'base64', 'base64DataUrl'] as const

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
  // Storage-Rules erlauben nur image/* — Base64-Fallback war immer ein Bild.
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
 * Migriert Legacy-Base64-Fotos aus fileUploads-Dokumenten nach Firebase Storage.
 * Läuft komplett im Browser des Admins; kann jederzeit abgebrochen und später
 * fortgesetzt werden (bereits migrierte Dokumente werden übersprungen).
 * Der Lesepfad der App unterstützt beide Varianten — parallel arbeitende
 * Mitarbeiter werden nicht gestört.
 */
export async function migrateBase64UploadsToStorage(
  onProgress?: (progress: Base64MigrationProgress) => void,
  shouldContinue?: () => boolean
): Promise<Base64MigrationResult> {
  await authReady

  const snapshot = await getDocs(collection(db, 'fileUploads'))
  const progress: Base64MigrationProgress = {
    scanned: 0,
    total: snapshot.size,
    migrated: 0,
    cleaned: 0,
    failed: 0,
    freedBytes: 0
  }

  for (const docSnap of snapshot.docs) {
    if (shouldContinue && !shouldContinue()) break
    progress.scanned++

    const data = docSnap.data() as Record<string, unknown>
    const found = extractBase64(data)
    if (!found) {
      if (progress.scanned % 25 === 0) onProgress?.({ ...progress })
      continue
    }

    const approxBytes = Math.round((found.base64.length * 3) / 4)
    const hasStorageUrl =
      (typeof data.filePath === 'string' && data.filePath.startsWith('http')) ||
      (typeof data.url === 'string' && data.url.startsWith('http')) ||
      (typeof data.storagePath === 'string' && String(data.storagePath).trim() !== '')

    try {
      if (hasStorageUrl) {
        // Bild liegt schon in Storage → nur die Base64-Reste entfernen
        const cleanup: Record<string, unknown> = {}
        for (const f of BASE64_FIELDS) if (f in data) cleanup[f] = deleteField()
        await updateDoc(doc(db, 'fileUploads', docSnap.id), cleanup)
        progress.cleaned++
        progress.freedBytes += approxBytes
      } else {
        const mime = resolveMimeType(data)
        const objectPath = buildObjectPath(data, docSnap.id, mime)
        const blob = base64ToBlob(found.base64, mime)
        const objectRef = storageRef(storage, objectPath)
        await uploadBytes(objectRef, blob, { contentType: mime })
        const downloadUrl = await getDownloadURL(objectRef)

        const update: Record<string, unknown> = {
          filePath: downloadUrl,
          storagePath: objectPath,
          mimeType: mime,
          base64MigratedAt: new Date()
        }
        for (const f of BASE64_FIELDS) if (f in data) update[f] = deleteField()
        await updateDoc(doc(db, 'fileUploads', docSnap.id), update)
        progress.migrated++
        progress.freedBytes += approxBytes
      }
    } catch (error) {
      progress.failed++
      console.error(`Base64-Migration für ${docSnap.id} fehlgeschlagen:`, error)
    }

    onProgress?.({ ...progress })
  }

  onProgress?.({ ...progress })
  return { ...progress, done: true }
}
