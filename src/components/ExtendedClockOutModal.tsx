import React, { useState } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, TimeEntryMaterialUsage } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import MaterialUsageFields, {
  buildMaterialUsagesFromRows,
  createMaterialUsageRow,
  type MaterialUsageRow
} from './MaterialUsageFields'
import { toast } from './ToastContainer'
import '../styles/Modal.css'

interface ExtendedClockOutModalProps {
  timeEntry: TimeEntry
  /** Gesamte Pausenzeit in Millisekunden (vom übergeordneten Formular, inkl. 0) */
  pauseTotalTimeMs: number
  onClose: () => void
  onClockOutSuccess: () => void
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
  const [noMaterial, setNoMaterial] = useState(false)
  const [materialRows, setMaterialRows] = useState<MaterialUsageRow[]>(() => [createMaterialUsageRow()])

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
      const types = await DataService.getActiveMaterialTypes()
      const typesById = new Map(types.map((t) => [t.id, t]))

      let materialUsages: TimeEntryMaterialUsage[] | undefined
      if (!noMaterial) {
        if (types.length === 0) {
          toast.error('Es sind keine Materialarten hinterlegt. Bitte den Administrator informieren.')
          setIsSubmitting(false)
          return
        }
        const built = buildMaterialUsagesFromRows(materialRows, typesById)
        if (built === null) {
          toast.error('Bitte bei jeder gewählten Materialart eine gültige Menge größer 0 eintragen.')
          setIsSubmitting(false)
          return
        }
        if (built.length === 0) {
          toast.error('Bitte mindestens eine Materialposition auswählen oder „kein Material“ ankreuzen.')
          setIsSubmitting(false)
          return
        }
        materialUsages = built
      } else {
        materialUsages = []
      }

      const location = await getCurrentLocation()

      const sitePhotoObjects = []
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

      const documentPhotoObjects = []
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

      await DataService.clockOutEmployee(timeEntry.id, notes, location, pauseTotalTimeMs, materialUsages)

      await DataService.updateTimeEntry(timeEntry.id, {
        sitePhotoUploads: sitePhotoObjects.map((u) => u.id),
        documentPhotoUploads: documentPhotoObjects.map((u) => u.id),
        sitePhotos: sitePhotoObjects,
        documents: documentPhotoObjects,
        hasDocumentation:
          sitePhotoObjects.length > 0 || documentPhotoObjects.length > 0 || notes.trim() !== ''
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
            <MaterialUsageFields
              noMaterial={noMaterial}
              onNoMaterialChange={setNoMaterial}
              rows={materialRows}
              onRowsChange={setMaterialRows}
            />

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

            <PhotoUpload label="Fotos von der Baustelle:" onItemsChange={setSitePhotoItems} />

            <PhotoUpload
              label="Lieferscheine oder Rechnungen:"
              onItemsChange={setDocumentPhotoItems}
              commentFieldLabel="Kommentar zu diesem Dokument (optional)"
            />

            <div className="form-group text-center">
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Speichere...' : 'Ausstempeln und Speichern'}
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

export default ExtendedClockOutModal
