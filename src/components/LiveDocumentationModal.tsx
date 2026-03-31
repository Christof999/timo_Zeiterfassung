import React, { useState } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const currentUser = await DataService.getCurrentUser()

      // Upload site photos (Kommentar pro Bild → imageComment)
      const sitePhotoObjects = []
      for (const { file, comment } of sitePhotoItems) {
        const upload = await DataService.uploadFile(
          file,
          timeEntry.projectId,
          timeEntry.employeeId,
          'construction_site',
          '',
          comment.trim()
        )
        sitePhotoObjects.push(upload)
      }

      // Upload document photos
      const documentPhotoObjects = []
      for (const { file, comment } of documentPhotoItems) {
        const documentType = file.name.toLowerCase().includes('rechnung') 
          ? 'invoice' 
          : 'delivery_note'
        const upload = await DataService.uploadFile(
          file,
          timeEntry.projectId,
          timeEntry.employeeId,
          documentType,
          '',
          comment.trim()
        )
        documentPhotoObjects.push(upload)
      }

      // Add live documentation
      await DataService.addLiveDocumentationToTimeEntry(timeEntry.id, {
        notes,
        images: sitePhotoObjects,
        documents: documentPhotoObjects,
        photoCount: sitePhotoObjects.length,
        documentCount: documentPhotoObjects.length,
        addedBy: currentUser!.id || '',
        addedByName: `${currentUser!.firstName || ''} ${currentUser!.lastName || ''}`
      })

      toast.success('Live-Dokumentation erfolgreich gespeichert!')
      onClose()
    } catch (error: any) {
      toast.error('Fehler beim Speichern: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Dokumentation hinzufügen</h3>
          <button type="button" className="close-modal-btn" onClick={onClose}>
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
            />

            <div className="form-group text-center">
              <button 
                type="submit" 
                className="btn primary-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Speichere...' : 'Dokumentation speichern'}
              </button>
              <button 
                type="button" 
                className="btn secondary-btn" 
                onClick={onClose}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LiveDocumentationModal

