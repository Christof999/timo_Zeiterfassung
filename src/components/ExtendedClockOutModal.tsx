import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Vehicle } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import { VehicleBookingFormFields } from './VehicleBookingFormFields'
import { toast } from './ToastContainer'
import { getTodayLocalDateString } from '../utils/dateUtils'
import '../styles/Modal.css'

interface ExtendedClockOutModalProps {
  timeEntry: TimeEntry
  /** Gesamte Pausenzeit in Millisekunden (vom übergeordneten Formular, inkl. 0) */
  pauseTotalTimeMs: number
  onClose: () => void
  onClockOutSuccess: () => void
}

type VehicleBookingRow = {
  id: string
  vehicleId: string
  hours: number
  comment: string
}

function createVehicleBookingRow(): VehicleBookingRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    vehicleId: '',
    hours: 1,
    comment: ''
  }
}

const ExtendedClockOutModal: React.FC<ExtendedClockOutModalProps> = ({
  timeEntry,
  pauseTotalTimeMs,
  onClose,
  onClockOutSuccess
}) => {
  const [notes, setNotes] = useState('')
  const [sitePhotoItems, setSitePhotoItems] = useState<PhotoUploadItem[]>([])
  const [documentPhotoItems, setDocumentPhotoItems] = useState<PhotoUploadItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleRows, setVehicleRows] = useState<VehicleBookingRow[]>(() => [createVehicleBookingRow()])

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const allVehicles = await DataService.getAllVehicles()
        setVehicles(allVehicles.filter(v => v.isActive !== false))
      } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error)
      }
    }
    loadVehicles()
  }, [])

  const updateVehicleRow = (id: string, patch: Partial<Omit<VehicleBookingRow, 'id'>>) => {
    setVehicleRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  const addVehicleRow = () => {
    setVehicleRows((rows) => [...rows, createVehicleBookingRow()])
  }

  const removeVehicleRow = (id: string) => {
    setVehicleRows((rows) => {
      const next = rows.filter((r) => r.id !== id)
      return next.length > 0 ? next : [createVehicleBookingRow()]
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      typeof pauseTotalTimeMs !== 'number' ||
      !Number.isFinite(pauseTotalTimeMs) ||
      pauseTotalTimeMs < 0
    ) {
      toast.error('Ungültige Pausenzeit. Bitte schließen Sie das Fenster und tragen Sie die Pause erneut ein.')
      return
    }
    setIsSubmitting(true)

    try {
      const bookingsToSave = vehicleRows.filter((r) => r.vehicleId.trim() !== '')

      if (bookingsToSave.length > 0) {
        for (const row of bookingsToSave) {
          if (!Number.isFinite(row.hours) || row.hours < 0.25 || row.hours > 24) {
            toast.error('Bitte gültige Betriebsstunden (0,25–24) für alle gewählten Fahrzeuge eingeben.')
            setIsSubmitting(false)
            return
          }
        }
        const currentUser = await DataService.getCurrentUser()
        if (!currentUser) {
          toast.error('Benutzer nicht gefunden.')
          setIsSubmitting(false)
          return
        }
        const today = getTodayLocalDateString()
        for (const row of bookingsToSave) {
          const selectedVehicle = vehicles.find(
            (v) => String(v.id) === String(row.vehicleId)
          )
          await DataService.addVehicleUsage({
            vehicleId: row.vehicleId,
            vehicleName: selectedVehicle?.name,
            employeeId: currentUser.id,
            projectId: timeEntry.projectId,
            date: today,
            hours: row.hours,
            hoursUsed: row.hours,
            comment: row.comment.trim() || undefined
          })
        }
      }

      const location = await getCurrentLocation()

      // Upload site photos (Kommentar pro Bild → imageComment in Firestore)
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

      // Clock out
      await DataService.clockOutEmployee(timeEntry.id, notes, location, pauseTotalTimeMs)

      // Update with documentation
      await DataService.updateTimeEntry(timeEntry.id, {
        sitePhotoUploads: sitePhotoObjects.map(u => u.id),
        documentPhotoUploads: documentPhotoObjects.map(u => u.id),
        sitePhotos: sitePhotoObjects,
        documents: documentPhotoObjects,
        hasDocumentation:
          sitePhotoObjects.length > 0 ||
          documentPhotoObjects.length > 0 ||
          notes.trim() !== ''
      })

      toast.success('Erfolgreich ausgestempelt mit Dokumentation!')

      onClockOutSuccess()
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
              onItemsChange={setSitePhotoItems}
            />

            <PhotoUpload
              label="Lieferscheine oder Rechnungen:"
              onItemsChange={setDocumentPhotoItems}
              commentFieldLabel="Kommentar zu diesem Dokument (optional)"
            />

            <div className="form-group">
              <h4 className="extended-doc-vehicle-heading">Fahrzeugzeit buchen (optional)</h4>
              <p className="form-hint" style={{ marginTop: 0 }}>
                Gleiche Auswahl wie bei „Fahrzeugzeit buchen“ auf der Zeiterfassungskarte. Mehrere Buchungen sind möglich.
              </p>
              {vehicleRows.map((row, index) => (
                <div
                  key={row.id}
                  className="extended-vehicle-booking-row"
                  style={index > 0 ? { marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e0e0e0)' } : undefined}
                >
                  {vehicleRows.length > 1 && (
                    <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <strong>Buchung {index + 1}</strong>
                    </div>
                  )}
                  <VehicleBookingFormFields
                    vehicles={vehicles}
                    selectedVehicleId={row.vehicleId}
                    hours={row.hours}
                    comment={row.comment}
                    onVehicleChange={(vehicleId) => updateVehicleRow(row.id, { vehicleId })}
                    onHoursChange={(hours) => updateVehicleRow(row.id, { hours })}
                    onCommentChange={(comment) => updateVehicleRow(row.id, { comment })}
                    idPrefix={`extended-vehicle-${row.id}`}
                  />
                  {vehicleRows.length > 1 && (
                    <div className="form-group">
                      <button
                        type="button"
                        className="btn secondary-btn"
                        onClick={() => removeVehicleRow(row.id)}
                        disabled={isSubmitting}
                      >
                        Diese Buchung entfernen
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="form-group">
                <button
                  type="button"
                  className="btn info-btn"
                  onClick={addVehicleRow}
                  disabled={isSubmitting}
                >
                  Weitere Fahrzeugbuchung hinzufügen
                </button>
              </div>
            </div>

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

