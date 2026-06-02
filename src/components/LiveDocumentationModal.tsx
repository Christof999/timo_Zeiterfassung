import React, { useState } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import SaveProgressOverlay from './SaveProgressOverlay'
import { uploadDocumentationWithOfflineFallback } from '../utils/saveDocumentationPhotos'
import { withTimeout } from '../utils/withTimeout'
import { toast } from './ToastContainer'
import '../styles/Modal.css'

interface LiveDocumentationModalProps {
  timeEntry: TimeEntry
  onClose: () => void
}

const LiveDocumentationModal: React.FC<LiveDocumentationModalProps> = ({
  timeEntry,
  onClose
}) => {
  const [notes, setNotes] = useState('')
  const [sitePhotoItems, setSitePhotoItems] = useState<PhotoUploadItem[]>([])
  const [documentPhotoItems, setDocumentPhotoItems] = useState<PhotoUploadItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressStep, setProgressStep] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

  const reportProgress = (message: string, step: number) => {
    setProgressMessage(message)
    setProgressStep(step)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fileCount = sitePhotoItems.length + documentPhotoItems.length
    const totalSteps = fileCount + 1

    setIsSubmitting(true)
    setProgressTotal(totalSteps)
    setProgressStep(0)
    setProgressMessage(
      fileCount > 0 ? 'Upload wird gestartet…' : 'Dokumentation wird gespeichert…'
    )

    try {
      const currentUser = await DataService.getCurrentUser()
      if (!currentUser?.id) {
        throw new Error('Benutzer nicht angemeldet')
      }

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
          notes,
          initialStep: 0,
          onProgress: ({ message, step }) => reportProgress(message, step)
        })

      // Online-Verknüpfung nur, wenn es online Hochgeladenes/Notizen gibt — sonst übernimmt
      // der Hintergrund-Upload alles (verhindert Hängen bei komplett fehlendem Netz).
      const hasOnlineUploads = siteUploads.length > 0 || documentUploads.length > 0
      if (hasOnlineUploads || deferredPhotos === 0) {
        reportProgress('Eintrag wird in der Zeiterfassung gespeichert…', totalSteps - 1)
        try {
          await withTimeout(
            DataService.addLiveDocumentationToTimeEntry(timeEntry.id, {
              notes,
              images: siteUploads,
              documents: documentUploads,
              photoCount: siteUploads.length,
              documentCount: documentUploads.length,
              addedBy: currentUser.id,
              addedByName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim()
            }),
            30_000,
            'Speichern hat zu lange gedauert — vermutlich schlechtes Netz.'
          )
        } catch (linkErr) {
          // Offline: Notizen/Fotos werden vom Hintergrund-Upload nachgereicht
          if (deferredPhotos === 0) throw linkErr
          console.warn('Live-Doku-Verknüpfung verschoben (offline):', linkErr)
        }
      }

      setProgressStep(totalSteps)
      if (deferredPhotos > 0) {
        toast.success(
          `Gespeichert. ${deferredPhotos} Foto(s) werden automatisch hochgeladen, sobald wieder Netz da ist.`
        )
      } else {
        toast.success('Live-Dokumentation erfolgreich gespeichert!')
      }
      onClose()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unbekannter Fehler'
      console.error('Live-Dokumentation speichern:', error)
      toast.error('Fehler beim Speichern: ' + msg)
    } finally {
      setIsSubmitting(false)
      setProgressMessage('')
      setProgressStep(0)
      setProgressTotal(0)
    }
  }

  return (
    <div className="modal-overlay" onClick={isSubmitting ? undefined : onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Dokumentation hinzufügen</h3>
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
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="live-notes">Beschreibung/Notizen:</label>
              <textarea
                id="live-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Beschreiben Sie was gerade gemacht wird..."
                disabled={isSubmitting}
              />
            </div>

            <PhotoUpload
              label="Baustellenfotos:"
              onItemsChange={setSitePhotoItems}
            />

            <PhotoUpload
              label="Dokumente/Lieferscheine:"
              onItemsChange={setDocumentPhotoItems}
              commentFieldLabel="Kommentar zu diesem Dokument (optional)"
              captureMode="document"
            />

            <div className="form-group text-center">
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Speichere…' : 'Dokumentation speichern'}
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

export default LiveDocumentationModal
