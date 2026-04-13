import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Vehicle, FileUpload } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import { VehicleBookingFormFields } from './VehicleBookingFormFields'
import { toast } from './ToastContainer'
import { formatDateForInputLocal } from '../utils/dateUtils'
import '../styles/Modal.css'
import '../styles/RetroactiveDocumentationModal.css'

interface AppendDocumentationModalProps {
  timeEntry: TimeEntry
  onClose: () => void
  onSaved: () => void
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleRows, setVehicleRows] = useState<VehicleBookingRow[]>(() => [createVehicleBookingRow()])

  const bookingDateForEntry = clockInToLocalDateString(timeEntry.clockInTime)

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const allVehicles = await DataService.getAllVehicles()
        setVehicles(allVehicles.filter((v) => v.isActive !== false))
      } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error)
      }
    }
    loadVehicles()
  }, [])

  const updateVehicleRow = (id: string, patch: Partial<Omit<VehicleBookingRow, 'id'>>) => {
    setVehicleRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
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

  const mergeFileList = (existing: unknown, additions: FileUpload[]): unknown[] => {
    const base = Array.isArray(existing) ? [...existing] : []
    return [...base, ...additions]
  }

  const mergeIdList = (existing: unknown, newIds: string[]): string[] => {
    const prev = Array.isArray(existing) ? (existing as string[]).filter(Boolean) : []
    return [...prev, ...newIds]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      }

      const notesChanged = notes.trim() !== (timeEntry.notes || '').trim()
      const hasNewPhotos = sitePhotoItems.length > 0 || documentPhotoItems.length > 0
      if (!notesChanged && !hasNewPhotos && bookingsToSave.length === 0) {
        toast.error('Bitte ergänzen Sie Notizen, Fotos/Dokumente oder Fahrzeugbuchungen.')
        setIsSubmitting(false)
        return
      }

      if (bookingsToSave.length > 0) {
        const currentUser = await DataService.getCurrentUser()
        if (!currentUser) {
          toast.error('Benutzer nicht gefunden.')
          setIsSubmitting(false)
          return
        }
        for (const row of bookingsToSave) {
          const selectedVehicle = vehicles.find((v) => String(v.id) === String(row.vehicleId))
          await DataService.addVehicleUsage({
            vehicleId: row.vehicleId,
            vehicleName: selectedVehicle?.name,
            employeeId: currentUser.id,
            projectId: timeEntry.projectId,
            timeEntryId: timeEntry.id,
            date: bookingDateForEntry,
            hours: row.hours,
            hoursUsed: row.hours,
            comment: row.comment.trim() || undefined
          })
        }
      }

      const sitePhotoObjects: FileUpload[] = []
      for (const { file, comment } of sitePhotoItems) {
        const upload = await DataService.uploadFile(
          file,
          timeEntry.projectId,
          timeEntry.employeeId,
          'construction_site',
          '',
          comment.trim(),
          { timeEntryId: timeEntry.id }
        )
        sitePhotoObjects.push(upload)
      }

      const documentPhotoObjects: FileUpload[] = []
      for (const { file, comment } of documentPhotoItems) {
        const documentType = file.name.toLowerCase().includes('rechnung') ? 'invoice' : 'delivery_note'
        const upload = await DataService.uploadFile(
          file,
          timeEntry.projectId,
          timeEntry.employeeId,
          documentType,
          '',
          comment.trim(),
          { timeEntryId: timeEntry.id }
        )
        documentPhotoObjects.push(upload)
      }

      const newSiteIds = sitePhotoObjects.map((u) => u.id)
      const newDocIds = documentPhotoObjects.map((u) => u.id)

      const mergedSiteUploads = mergeIdList(timeEntry.sitePhotoUploads, newSiteIds)
      const mergedDocUploads = mergeIdList(timeEntry.documentPhotoUploads, newDocIds)
      const mergedSitePhotos = mergeFileList(timeEntry.sitePhotos, sitePhotoObjects)
      const mergedDocuments = mergeFileList(timeEntry.documents, documentPhotoObjects)

      await DataService.updateTimeEntry(timeEntry.id, {
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
      })

      toast.success('Dokumentation wurde gespeichert.')
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error('Fehler beim Speichern: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay retro-doc-detail-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Bericht / Dokumentation nachtragen</h3>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="form-hint" style={{ marginTop: 0 }}>
            Gleicher Umfang wie beim Ausstempeln mit Dokumentation (Notizen, Baustellenfotos, Belege,
            optionale Fahrzeugzeit für den Tag des Eintrags: {bookingDateForEntry}).
          </p>
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
            />

            <div className="form-group">
              <h4 className="extended-doc-vehicle-heading">Fahrzeugzeit buchen (optional)</h4>
              <p className="form-hint" style={{ marginTop: 0 }}>
                Buchungen werden dem Kalendertag des Zeiteintrags zugeordnet ({bookingDateForEntry}).
              </p>
              {vehicleRows.map((row, index) => (
                <div
                  key={row.id}
                  className="extended-vehicle-booking-row"
                  style={
                    index > 0
                      ? { marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e0e0e0)' }
                      : undefined
                  }
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
                    idPrefix={`retro-doc-vehicle-${row.id}`}
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
                <button type="button" className="btn info-btn" onClick={addVehicleRow} disabled={isSubmitting}>
                  Weitere Fahrzeugbuchung hinzufügen
                </button>
              </div>
            </div>

            <div className="form-group text-center">
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Speichere...' : 'Dokumentation speichern'}
              </button>
              <button type="button" className="btn secondary-btn" onClick={onClose}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AppendDocumentationModal
