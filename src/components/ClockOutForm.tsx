import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Project, MaterialType, TimeEntryMaterialUsage } from '../types'
import ExtendedClockOutModal from './ExtendedClockOutModal'
import LiveDocumentationModal from './LiveDocumentationModal'
import MaterialUsageFields, {
  buildMaterialUsagesFromRows,
  createMaterialUsageRow,
  type MaterialUsageRow
} from './MaterialUsageFields'
import { toast } from './ToastContainer'
import '../styles/ClockOutForm.css'

interface ClockOutFormProps {
  timeEntry: TimeEntry
  project: Project | null
  clockInTime: Date | null
  onSimpleClockOut: (pauseMinutes: number, materialUsages: TimeEntryMaterialUsage[] | undefined) => void
  onExtendedClockOutSuccess: () => void
  onUpdate: () => void
}

const ClockOutForm: React.FC<ClockOutFormProps> = ({
  timeEntry,
  project,
  clockInTime,
  onSimpleClockOut,
  onExtendedClockOutSuccess,
  onUpdate
}) => {
  const [showExtendedModal, setShowExtendedModal] = useState(false)
  const [showLiveDocModal, setShowLiveDocModal] = useState(false)
  /** Leer = noch nicht bestätigt; „0“ ist gültig */
  const [pauseMinutesInput, setPauseMinutesInput] = useState('')
  /** Beim Öffnen „Mit Dokumentation“ festgehaltene Pausenzeit (ms), damit das Modal nicht durch nachträgliche Eingabe ungültig wird */
  const [pauseMsForExtendedModal, setPauseMsForExtendedModal] = useState<number | null>(null)
  const [noMaterial, setNoMaterial] = useState(false)
  const [materialRows, setMaterialRows] = useState<MaterialUsageRow[]>(() => [createMaterialUsageRow()])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])

  useEffect(() => {
    DataService.getActiveMaterialTypes().then(setMaterialTypes).catch(() => setMaterialTypes([]))
  }, [])

  const formatTime = (date: Date | null) => {
    if (!date) return '-'
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  const parsePauseMinutes = (): number | null => {
    const raw = pauseMinutesInput.trim()
    if (raw === '') {
      toast.error('Bitte geben Sie die Pausenzeit in Minuten ein (0, wenn keine Pause).')
      return null
    }
    const n = Number.parseInt(raw, 10)
    if (Number.isNaN(n) || n < 0 || n > 24 * 60) {
      toast.error('Pausenzeit: bitte eine ganze Zahl zwischen 0 und 1440 Minuten.')
      return null
    }
    return n
  }

  const handleSimpleClockOutClick = () => {
    const minutes = parsePauseMinutes()
    if (minutes === null) return

    const typesById = new Map(materialTypes.map((t) => [t.id, t]))
    let materialUsages: TimeEntryMaterialUsage[] | undefined
    if (!noMaterial) {
      if (materialTypes.length === 0) {
        toast.error('Es sind keine Materialarten hinterlegt. Bitte den Administrator unter „Material“ informieren.')
        return
      }
      const built = buildMaterialUsagesFromRows(materialRows, typesById)
      if (built === null) {
        toast.error('Bitte bei jeder gewählten Materialart eine gültige Menge größer 0 eintragen.')
        return
      }
      if (built.length === 0) {
        toast.error('Bitte mindestens eine Materialposition auswählen oder „kein Material“ ankreuzen.')
        return
      }
      materialUsages = built
    } else {
      materialUsages = []
    }

    onSimpleClockOut(minutes, materialUsages)
  }

  return (
    <div className="clock-out-form">
      <div className="active-project-info">
        <h3>Aktives Projekt</h3>
        <div className="project-details">
          <p className="project-name">
            <strong>{project?.name || 'Unbekanntes Projekt'}</strong>
          </p>
          <p className="project-client">Kunde: {project?.client || '-'}</p>
          <p className="project-location">
            Adresse: {project?.address || project?.location || '-'}
          </p>
        </div>
      </div>

      <p className="clock-in-info">
        Eingestempelt seit: {formatTime(clockInTime)}
      </p>

      <MaterialUsageFields
        noMaterial={noMaterial}
        onNoMaterialChange={setNoMaterial}
        rows={materialRows}
        onRowsChange={setMaterialRows}
      />

      <div className="pause-input-section">
        <label htmlFor="clock-out-pause-minutes" className="pause-input-label">
          Pausenzeit gesamt (Minuten) <span className="required-mark">*</span>
        </label>
        <input
          id="clock-out-pause-minutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          step={1}
          className="pause-minutes-input"
          value={pauseMinutesInput}
          onChange={(e) => setPauseMinutesInput(e.target.value)}
          placeholder="z. B. 0 oder 30"
          autoComplete="off"
        />
        <p className="pause-input-hint">
          Pflichtangabe zum Ausstempeln. Ohne Pause: <strong>0</strong> eintragen.
        </p>
      </div>

      <div className="clock-out-buttons">
        <button type="button" onClick={handleSimpleClockOutClick} className="btn secondary-btn">
          Einfach Ausstempeln
        </button>
        <button 
          onClick={() => setShowLiveDocModal(true)} 
          className="btn info-btn"
        >
          Dokumentation hinzufügen
        </button>
        <button
          type="button"
          onClick={() => {
            const minutes = parsePauseMinutes()
            if (minutes === null) return
            setPauseMsForExtendedModal(minutes * 60 * 1000)
            setShowExtendedModal(true)
          }}
          className="btn primary-btn"
        >
          Mit Dokumentation Ausstempeln
        </button>
      </div>

      {showExtendedModal && pauseMsForExtendedModal !== null && (
        <ExtendedClockOutModal
          timeEntry={timeEntry}
          pauseTotalTimeMs={pauseMsForExtendedModal}
          onClose={() => {
            setShowExtendedModal(false)
            setPauseMsForExtendedModal(null)
            onUpdate()
          }}
          onClockOutSuccess={() => {
            setPauseMsForExtendedModal(null)
            onExtendedClockOutSuccess()
          }}
        />
      )}

      {showLiveDocModal && (
        <LiveDocumentationModal
          timeEntry={timeEntry}
          onClose={() => {
            setShowLiveDocModal(false)
            onUpdate()
          }}
        />
      )}
    </div>
  )
}

export default ClockOutForm

