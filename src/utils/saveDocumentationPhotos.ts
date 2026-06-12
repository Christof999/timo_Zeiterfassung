import { DataService } from '../services/dataService'
import { offlineUploadQueue, type PendingPhoto } from '../services/offlineUploadQueue'
import type { FileUpload } from '../types'
import type { PhotoUploadItem } from '../components/PhotoUpload'
import { TimeoutError } from './withTimeout'

export interface PhotoBatch {
  items: PhotoUploadItem[]
  resolveFileType: (file: File) => string
  category: 'site' | 'document'
  label: string
}

export interface UploadWithFallbackResult {
  siteUploads: FileUpload[]
  documentUploads: FileUpload[]
  deferredPhotos: number
  /** true, wenn ab dem ersten Foto offline ausgewichen wurde (gar kein Upload online möglich). */
  startedOffline: boolean
  stepsDone: number
}

/** „Zu groß für die Datenbank“ wird auch beim Retry nie passen → nicht in die Queue, sondern Fehler zeigen. */
export function isPermanentUploadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('zu groß für die Datenbank')
}

/** Sieht der Fehler nach „Netz weg/instabil“ aus? Dann lieber offline zwischenspeichern statt verlieren. */
export function shouldDeferUpload(err: unknown): boolean {
  if (isPermanentUploadError(err)) return false
  if (err instanceof TimeoutError) return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return /network|netzwerk|unavailable|deadline|timeout|zeitüber|offline|failed to fetch|fetch|storage|quota|retry|schlechtes netz/.test(
    msg
  )
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function toPendingPhoto(item: PhotoUploadItem, batch: PhotoBatch): PendingPhoto {
  return {
    blob: item.file,
    fileName: item.file.name || 'foto.jpg',
    fileType: batch.resolveFileType(item.file),
    comment: (item.comment || '').trim()
  }
}

/**
 * Lädt Dokumentations-Fotos hoch. Solange Netz da ist, sofort online (wie bisher).
 * Bricht ein Upload wegen Netzproblemen ab, wandern dieses und alle restlichen Fotos in die
 * Offline-Queue und werden später automatisch nachgereicht. Bereits online hochgeladene Fotos
 * werden normal zurückgegeben, damit der Aufrufer sie sofort verknüpfen kann.
 */
export async function uploadDocumentationWithOfflineFallback(params: {
  batches: PhotoBatch[]
  projectId: string
  employeeId: string
  timeEntryId: string
  notes?: string
  initialStep?: number
  onProgress?: (info: { message: string; step: number }) => void
}): Promise<UploadWithFallbackResult> {
  const { batches, projectId, employeeId, timeEntryId, notes, onProgress } = params

  const siteUploads: FileUpload[] = []
  const documentUploads: FileUpload[] = []
  const deferredSite: PendingPhoto[] = []
  const deferredDoc: PendingPhoto[] = []

  let step = params.initialStep ?? 0
  let deferring = false
  let startedOffline = false

  const totalPhotos = batches.reduce((n, b) => n + b.items.length, 0)
  let index = 0

  for (const batch of batches) {
    for (const item of batch.items) {
      index += 1

      const pushDeferred = () => {
        const photo = toPendingPhoto(item, batch)
        if (batch.category === 'site') deferredSite.push(photo)
        else deferredDoc.push(photo)
      }

      if (deferring) {
        pushDeferred()
        continue
      }

      // Bereits beim ersten Foto offline → gar nicht erst versuchen, direkt zwischenspeichern
      if (isOffline()) {
        if (index === 1) startedOffline = true
        deferring = true
        pushDeferred()
        continue
      }

      onProgress?.({ message: `${batch.label} ${index} von ${totalPhotos}`, step })
      try {
        const upload = await DataService.uploadFile(
          item.file,
          projectId,
          employeeId,
          batch.resolveFileType(item.file),
          '',
          (item.comment || '').trim(),
          {
            timeEntryId,
            onProgress: (detail) =>
              onProgress?.({ message: `${batch.label} ${index}/${totalPhotos}: ${detail}`, step })
          }
        )
        if (batch.category === 'site') siteUploads.push(upload)
        else documentUploads.push(upload)
        step += 1
        onProgress?.({ message: `${batch.label} ${index} gespeichert`, step })
      } catch (err) {
        if (!shouldDeferUpload(err)) throw err
        if (index === 1) startedOffline = true
        deferring = true
        pushDeferred()
      }
    }
  }

  const deferredPhotos = deferredSite.length + deferredDoc.length
  if (deferredPhotos > 0) {
    await offlineUploadQueue.enqueue({
      timeEntryId,
      projectId,
      employeeId,
      notes,
      sitePhotos: deferredSite,
      documentPhotos: deferredDoc
    })
  }

  return { siteUploads, documentUploads, deferredPhotos, startedOffline, stepsDone: step }
}
