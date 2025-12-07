import React, { useState } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry } from '../types'
import PhotoUpload from './PhotoUpload'
import { toast } from './ToastContainer'
import '../styles/Modal.css'

interface ExtendedClockOutModalProps {
  timeEntry: TimeEntry
  onClose: () => void
  onClockOut: () => void
}

const ExtendedClockOutModal: React.FC<ExtendedClockOutModalProps> = ({
  timeEntry,
  onClose,
  onClockOut
}) => {
  const [notes, setNotes] = useState('')
  const [sitePhotos, setSitePhotos] = useState<File[]>([])
  const [documentPhotos, setDocumentPhotos] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const location = await getCurrentLocation()

      // Upload site photos
      const sitePhotoObjects = []
      for (const file of sitePhotos) {
        const upload = await DataService.uploadFile(
          file,
          timeEntry.projectId,
          timeEntry.employeeId,
          'construction_site',
          notes,
          ''
        )
        sitePhotoObjects.push(upload)
      }

      // Upload document photos
      const documentPhotoObjects = []
      for (const file of documentPhotos) {
        const documentType = file.name.toLowerCase().includes('rechnung') 
          ? 'invoice' 
          : 'delivery_note'
        const upload = await DataService.uploadFile(
          file,
          timeEntry.projectId,
          timeEntry.employeeId,
          documentType,
          notes,
          ''
        )
        documentPhotoObjects.push(upload)
      }

      // Clock out
      const result = await DataService.clockOutEmployee(
        timeEntry.id,
        notes,
        location
      )

      // Update with documentation
      await DataService.updateTimeEntry(timeEntry.id, {
        sitePhotoUploads: sitePhotoObjects.map(u => u.id),
        documentPhotoUploads: documentPhotoObjects.map(u => u.id),
        sitePhotos: sitePhotoObjects,
        documents: documentPhotoObjects,
        hasDocumentation: sitePhotoObjects.length > 0 || 
                         documentPhotoObjects.length > 0 || 
                         notes.trim() !== ''
      })

      if (result.automaticBreak) {
        toast.success(`Erfolgreich ausgestempelt mit Dokumentation! Automatische Pause hinzugefügt: ${result.automaticBreak.duration} Minuten (${result.automaticBreak.reason})`, 6000)
      } else {
        toast.success('Erfolgreich ausgestempelt mit Dokumentation!')
      }

      onClockOut()
      onClose()
    } catch (error: any) {
      toast.error('Fehler beim Ausstempeln: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getCurrentLocation = (): Promise<{ lat: number | null; lng: number | null }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
        },
        () => {
          resolve({ lat: null, lng: null })
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Arbeitsende dokumentieren</h3>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="clock-out-notes">Notizen zur durchgeführten Arbeit:</label>
              <textarea
                id="clock-out-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Beschreiben Sie die durchgeführten Arbeiten..."
              />
            </div>

            <PhotoUpload
              label="Fotos von der Baustelle:"
              onPhotosChange={setSitePhotos}
            />

            <PhotoUpload
              label="Lieferscheine oder Rechnungen:"
              onPhotosChange={setDocumentPhotos}
            />

            <div className="form-group text-center">
              <button 
                type="submit" 
                className="btn primary-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Speichere...' : 'Ausstempeln und Speichern'}
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

export default ExtendedClockOutModal

