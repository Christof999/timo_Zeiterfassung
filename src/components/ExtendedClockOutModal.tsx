import React, { useState } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, TimeEntryMaterialUsage } from '../types'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import MaterialUsageFields, {
  buildMaterialUsagesFromRows,
  createMaterialUsageRow,
  type MaterialUsageRow,
  type OfferMaterialOption
} from './MaterialUsageFields'
import SaveProgressOverlay from './SaveProgressOverlay'
import { uploadDocumentationWithOfflineFallback } from '../utils/saveDocumentationPhotos'
import { withTimeout } from '../utils/withTimeout'
import { formatReturnTravelCreditNote } from '../utils/returnTravel'
import { toast } from './ToastContainer'
import '../styles/Modal.css'

interface ExtendedClockOutModalProps {
  timeEntry: TimeEntry
  /** Gesamte Pausenzeit in Millisekunden (vom übergeordneten Formular, inkl. 0) */
  pauseTotalTimeMs: number
  /** Projekt mit HERO-Angebot: nur diese Material-Positionen + Freitext */
  offerMaterials?: OfferMaterialOption[]
  onClose: () => void
  onClockOutSuccess: () => void
}

const ExtendedClockOutModal: React.FC<ExtendedClockOutModalProps> = ({
  timeEntry,
  pauseTotalTimeMs,
  offerMaterials,
  onClose,
  onClockOutSuccess
}) => {
  const [notes, setNotes] = useState('')
  const [sitePhotoItems, setSitePhotoItems] = useState<PhotoUploadItem[]>([])
  const [documentPhotoItems, setDocumentPhotoItems] = useState<PhotoUploadItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [noMaterial, setNoMaterial] = useState(false)
  const [materialRows, setMaterialRows] = useState<MaterialUsageRow[]>(() => [createMaterialUsageRow()])
  // Optionale Gutschrift (zu viel geliefertes Material), eingeklappt bis bei Bedarf geöffnet
  const [showCredit, setShowCredit] = useState(false)
  const [creditRows, setCreditRows] = useState<MaterialUsageRow[]>(() => [createMaterialUsageRow()])
  const [progressMessage, setProgressMessage] = useState('')
  const [progressStep, setProgressStep] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

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

      // Optionale Material-Gutschrift (nur wenn aufgeklappt und befüllt)
      let materialCreditUsages: TimeEntryMaterialUsage[] | undefined
      if (showCredit) {
        const builtCredits = buildMaterialUsagesFromRows(creditRows, typesById)
        if (builtCredits === null) {
          toast.error('Bitte bei jeder Gutschrift-Position eine gültige Menge größer 0 eintragen.')
          setIsSubmitting(false)
          return
        }
        if (builtCredits.length > 0) {
          materialCreditUsages = builtCredits
        }
      }

      const fileCount = sitePhotoItems.length + documentPhotoItems.length
      const totalSteps = fileCount + 1
      setProgressTotal(totalSteps)
      setProgressStep(0)
      setProgressMessage('Arbeitsende wird gespeichert…')

      const location = await getCurrentLocation()

      // Zuerst ausstempeln (inkl. Material/Pause) — Fotos dürfen das Arbeitsende bei schlechtem
      // Netz nicht mehr blockieren.
      await DataService.clockOutEmployee(
        timeEntry.id,
        notes,
        location,
        pauseTotalTimeMs,
        materialUsages,
        materialCreditUsages
      )

      // Fotos hochladen — bei Netzproblemen wandern sie in die Offline-Queue (Upload später).
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
          onProgress: ({ message, step }) => {
            setProgressMessage(message)
            setProgressStep(step)
          }
        })

      // Online hochgeladene Fotos sofort verknüpfen (per Merge, falls die Queue parallel nachreicht)
      if (siteUploads.length > 0 || documentUploads.length > 0) {
        setProgressMessage('Fotos werden mit dem Eintrag verknüpft…')
        setProgressStep(totalSteps - 1)
        try {
          await withTimeout(
            DataService.attachDocumentationUploads(timeEntry.id, {
              sitePhotos: siteUploads,
              documents: documentUploads
            }),
            30_000,
            'Speichern hat zu lange gedauert — vermutlich schlechtes Netz.'
          )
        } catch (linkErr) {
          if (deferredPhotos === 0) throw linkErr
          console.warn('Doku-Verknüpfung verschoben (offline):', linkErr)
        }
      }

      setProgressStep(totalSteps)
      const creditNote = formatReturnTravelCreditNote(location)
      if (deferredPhotos > 0) {
        toast.success(
          `Ausgestempelt.${creditNote} ${deferredPhotos} Foto(s) werden automatisch hochgeladen, sobald wieder Netz da ist.`
        )
      } else {
        toast.success(`Erfolgreich ausgestempelt mit Dokumentation!${creditNote}`)
      }

      onClockOutSuccess()
      onClose()
    } catch (error: any) {
      toast.error('Fehler beim Ausstempeln: ' + error.message)
    } finally {
      setIsSubmitting(false)
      setProgressMessage('')
      setProgressStep(0)
      setProgressTotal(0)
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
    <div className="modal-overlay" onClick={isSubmitting ? undefined : onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Arbeitsende dokumentieren</h3>
          <button type="button" className="close-modal-btn" onClick={onClose} disabled={isSubmitting}>
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
              offerMaterials={offerMaterials}
            />

            <div className="material-credit-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={showCredit}
                  onChange={(e) => setShowCredit(e.target.checked)}
                />
                <span>Material gutschreiben (zu viel geliefert / Rückgabe)</span>
              </label>
            </div>

            {showCredit && (
              <MaterialUsageFields
                noMaterial={false}
                onNoMaterialChange={() => {}}
                rows={creditRows}
                onRowsChange={setCreditRows}
                hideNoMaterialToggle
                title="Material-Gutschrift"
                intro="Zu viel geliefertes Material, das zurückgeht – Material wählen oder eingeben, Menge erfassen."
              />
            )}

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
              captureMode="document"
            />

            <div className="form-group text-center">
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Speichere...' : 'Ausstempeln und Speichern'}
              </button>
              <button type="button" className="btn secondary-btn" onClick={onClose} disabled={isSubmitting}>
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

export default ExtendedClockOutModal
