import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Vehicle, FileUpload } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import SaveProgressOverlay from './SaveProgressOverlay'
import { VehicleBookingFormFields } from './VehicleBookingFormFields'
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
  const [progressMessage, setProgressMessage] = useState('')
  const [progressStep, setProgressStep] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
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
    return [...base, ...additions.map(toFileUploadRef)]
  }

  const mergeIdList = (existing: unknown, newIds: string[]): string[] => {
    const prev = Array.isArray(existing) ? (existing as string[]).filter(Boolean) : []
    return [...prev, ...newIds]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const bookingsToSave = vehicleRows.filter((r) => r.vehicleId.trim() !== '')

    if (bookingsToSave.length > 0) {
      for (const row of bookingsToSave) {
        if (!Number.isFinite(row.hours) || row.hours < 0.25 || row.hours > 24) {
          toast.error('Bitte gültige Betriebsstunden (0,25–24) für alle gewählten Fahrzeuge eingeben.')
          return
        }
      }
    }

    const notesChanged = notes.trim() !== (timeEntry.notes || '').trim()
    const hasNewPhotos = sitePhotoItems.length > 0 || documentPhotoItems.length > 0
    if (!notesChanged && !hasNewPhotos && bookingsToSave.length === 0) {
      toast.error('Bitte ergänzen Sie Notizen, Fotos/Dokumente oder Fahrzeugbuchungen.')
      return
    }

    const fileCount = sitePhotoItems.length + documentPhotoItems.length
    const totalSteps = bookingsToSave.length + fileCount + 1

    setIsSubmitting(true)
    setProgressTotal(totalSteps)
    setProgressStep(0)
    setProgressMessage('Speichern wird vorbereitet…')

    try {
      let step = 0

      if (bookingsToSave.length > 0) {
        const currentUser = await DataService.getCurrentUser()
        if (!currentUser) {
          throw new Error('Benutzer nicht gefunden.')
        }
        for (const row of bookingsToSave) {
          setProgressMessage(`Fahrzeugbuchung ${step + 1} von ${bookingsToSave.length}`)
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
          step += 1
          setProgressStep(step)
        }
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
          notes: notes.trim(),
          initialStep: step,
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
              captureMode="document"
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
