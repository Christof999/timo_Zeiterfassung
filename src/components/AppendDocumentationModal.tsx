import React, { useState } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, FileUpload } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import SaveProgressOverlay from './SaveProgressOverlay'
import { uploadDocumentationWithOfflineFallback } from '../utils/saveDocumentationPhotos'
import { withTimeout } from '../utils/withTimeout'
import { toFileUploadRef } from '../utils/fileUploadRef'
import { toast } from './ToastContainer'
import { formatDateForInputLocal } from '../utils/dateUtils'
import '../styles/Modal.css'
import '../styles/RetroactiveDocumentationModal.css'

interface AppendDocumentationModalProps {
  timeEntry: TimeEntry
  onClose: () => void
  onSaved: () => void
}

function clockInToLocalDateString(clockIn: TimeEntry['clockInTime']): string {
  if (!clockIn) return formatDateForInputLocal(new Date())
  try {
    const d =
      clockIn instanceof Date
        ? clockIn
        : (clockIn as any)?.toDate?.()
          ? (clockIn as any).toDate()
          : new Date(clockIn as any)
    if (isNaN(d.getTime())) return formatDateForInputLocal(new Date())
    return formatDateForInputLocal(d)
  } catch {
    return formatDateForInputLocal(new Date())
  }
}

const AppendDocumentationModal: React.FC<AppendDocumentationModalProps> = ({
  timeEntry,
  onClose,
  onSaved
}) => {
  const [notes, setNotes] = useState(() => (timeEntry.notes || '').trim())
  const [sitePhotoItems, setSitePhotoItems] = useState<PhotoUploadItem[]>([])
  const [documentPhotoItems, setDocumentPhotoItems] = useState<PhotoUploadItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressStep, setProgressStep] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

  // Bereits erfasste Live-Dokumentationen (z. B. während des Einstempelns) – bearbeitbar
  const liveBlocks = timeEntry.liveDocumentation || []
  const [liveNotes, setLiveNotes] = useState<string[]>(() =>
    liveBlocks.map((block) => (block.notes || '').trim())
  )
  const [savingLiveIndex, setSavingLiveIndex] = useState<number | null>(null)

  const bookingDateForEntry = clockInToLocalDateString(timeEntry.clockInTime)

  const handleSaveLiveBlock = async (index: number) => {
    setSavingLiveIndex(index)
    try {
      await withTimeout(
        DataService.updateLiveDocumentationNotes(timeEntry.id, index, liveNotes[index].trim()),
        30_000,
        'Speichern hat zu lange gedauert — vermutlich schlechtes Netz.'
      )
      toast.success('Bericht aktualisiert.')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unbekannter Fehler'
      toast.error('Fehler beim Speichern: ' + msg)
    } finally {
      setSavingLiveIndex(null)
    }
  }

  const mergeFileList = (existing: unknown, additions: FileUpload[]): unknown[] => {
    const base = Array.isArray(existing) ? [...existing] : []
    return [...base, ...additions.map(toFileUploadRef)]
  }

  const mergeIdList = (existing: unknown, newIds: string[]): string[] => {
    const prev = Array.isArray(existing) ? (existing as string[]).filter(Boolean) : []
    return [...prev, ...newIds]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const notesChanged = notes.trim() !== (timeEntry.notes || '').trim()
    const hasNewPhotos = sitePhotoItems.length > 0 || documentPhotoItems.length > 0
    if (!notesChanged && !hasNewPhotos) {
      toast.error('Bitte ergänzen Sie Notizen oder Fotos/Dokumente.')
      return
    }

    const fileCount = sitePhotoItems.length + documentPhotoItems.length
    const totalSteps = fileCount + 1

    setIsSubmitting(true)
    setProgressTotal(totalSteps)
    setProgressStep(0)
    setProgressMessage('Speichern wird vorbereitet…')

    try {
      const { siteUploads, documentUploads, deferredPhotos } =
        await uploadDocumentationWithOfflineFallback({
          batches: [
            {
              items: sitePhotoItems,
              resolveFileType: () => 'construction_site',
              category: 'site',
              label: 'Baustellenfoto'
            },
            {
              items: documentPhotoItems,
              resolveFileType: (file) =>
                file.name.toLowerCase().includes('rechnung') ? 'invoice' : 'delivery_note',
              category: 'document',
              label: 'Dokument'
            }
          ],
          projectId: timeEntry.projectId,
          employeeId: timeEntry.employeeId,
          timeEntryId: timeEntry.id,
          notes: notes.trim(),
          initialStep: 0,
          onProgress: ({ message, step: s }) => {
            setProgressMessage(message)
            setProgressStep(s)
          }
        })

      const mergedSiteUploads = mergeIdList(timeEntry.sitePhotoUploads, siteUploads.map((u) => u.id))
      const mergedDocUploads = mergeIdList(timeEntry.documentPhotoUploads, documentUploads.map((u) => u.id))
      const mergedSitePhotos = mergeFileList(timeEntry.sitePhotos, siteUploads)
      const mergedDocuments = mergeFileList(timeEntry.documents, documentUploads)

      // Online-Verknüpfung nur, wenn etwas online gespeichert werden muss — sonst übernimmt der
      // Hintergrund-Upload Notizen + Fotos (verhindert Hängen bei komplett fehlendem Netz).
      const hasOnlineUploads = siteUploads.length > 0 || documentUploads.length > 0
      if (hasOnlineUploads || deferredPhotos === 0) {
        setProgressMessage('Zeiteintrag wird aktualisiert…')
        try {
          await withTimeout(
            DataService.updateTimeEntry(timeEntry.id, {
              notes: notes.trim(),
              sitePhotoUploads: mergedSiteUploads,
              documentPhotoUploads: mergedDocUploads,
              sitePhotos: mergedSitePhotos as TimeEntry['sitePhotos'],
              documents: mergedDocuments as TimeEntry['documents'],
              hasDocumentation:
                !!timeEntry.hasDocumentation ||
                mergedSiteUploads.length > 0 ||
                mergedDocUploads.length > 0 ||
                notes.trim() !== ''
            }),
            30_000,
            'Speichern hat zu lange gedauert — vermutlich schlechtes Netz.'
          )
        } catch (linkErr) {
          // Offline: Notizen/Fotos werden vom Hintergrund-Upload nachgereicht
          if (deferredPhotos === 0) throw linkErr
          console.warn('Doku-Verknüpfung verschoben (offline):', linkErr)
        }
      }

      setProgressStep(totalSteps)
      if (deferredPhotos > 0) {
        toast.success(
          `Gespeichert. ${deferredPhotos} Foto(s) werden automatisch hochgeladen, sobald wieder Netz da ist.`
        )
      } else {
        toast.success('Dokumentation wurde gespeichert.')
      }
      onSaved()
      onClose()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unbekannter Fehler'
      console.error('Dokumentation nachtragen:', error)
      toast.error('Fehler beim Speichern: ' + msg)
    } finally {
      setIsSubmitting(false)
      setProgressMessage('')
      setProgressStep(0)
      setProgressTotal(0)
    }
  }

  return (
    <div
      className="modal-overlay retro-doc-detail-overlay"
      onClick={isSubmitting ? undefined : onClose}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Bericht / Dokumentation nachtragen</h3>
          <button
            type="button"
            className="close-modal-btn"
            onClick={onClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="form-hint" style={{ marginTop: 0 }}>
            Gleicher Umfang wie beim Ausstempeln mit Dokumentation (Notizen, Baustellenfotos und
            Belege für den Tag des Eintrags: {bookingDateForEntry}).
          </p>

          {liveBlocks.length > 0 && (
            <div className="retro-live-edit-section">
              <h4 className="retro-live-edit-title">Bereits erfasste Berichte bearbeiten</h4>
              {liveBlocks.map((block, index) => {
                const original = (block.notes || '').trim()
                const changed = liveNotes[index].trim() !== original
                const counts =
                  (block.photoCount || 0) > 0 || (block.documentCount || 0) > 0
                    ? `${block.photoCount || 0} Fotos · ${block.documentCount || 0} Dok.`
                    : ''
                return (
                  <div key={index} className="retro-live-edit-item">
                    <div className="retro-live-edit-meta">
                      <strong>{block.addedByName || 'Bericht'}</strong>
                      {counts && <span className="retro-live-edit-counts">{counts}</span>}
                    </div>
                    <textarea
                      rows={3}
                      value={liveNotes[index]}
                      onChange={(e) =>
                        setLiveNotes((prev) => {
                          const next = [...prev]
                          next[index] = e.target.value
                          return next
                        })
                      }
                      placeholder="Berichtstext..."
                      disabled={savingLiveIndex === index}
                    />
                    <button
                      type="button"
                      className="btn secondary-btn retro-live-edit-save"
                      onClick={() => handleSaveLiveBlock(index)}
                      disabled={!changed || savingLiveIndex === index}
                    >
                      {savingLiveIndex === index ? 'Speichere…' : 'Änderung speichern'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="retro-doc-notes">Notizen zur durchgeführten Arbeit:</label>
              <textarea
                id="retro-doc-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Beschreiben Sie die durchgeführten Arbeiten..."
              />
            </div>

            <PhotoUpload label="Fotos von der Baustelle:" onItemsChange={setSitePhotoItems} />

            <PhotoUpload
              label="Lieferscheine oder Rechnungen:"
              onItemsChange={setDocumentPhotoItems}
              commentFieldLabel="Kommentar zu diesem Dokument (optional)"
              captureMode="document"
            />

            <div className="form-group text-center">
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Speichere...' : 'Dokumentation speichern'}
              </button>
              <button
                type="button"
                className="btn secondary-btn"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>

      <SaveProgressOverlay
        visible={isSubmitting}
        message={progressMessage || 'Bitte warten…'}
        current={progressStep}
        total={progressTotal}
      />
    </div>
  )
}

export default AppendDocumentationModal
