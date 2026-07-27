import React, { useMemo, useState } from 'react'
import { DataService } from '../../services/dataService'
import type { Project } from '../../types'
import { toast } from '../ToastContainer'
import SearchableSelect, { type SearchableOption } from '../SearchableSelect'
import '../../styles/Modal.css'

interface ReportAddEntryModalProps {
  employeeId: string
  employeeName: string
  projects: Project[]
  /** Vorbelegtes Datum (yyyy-mm-dd) – i. d. R. der Beginn des Berichtszeitraums. */
  defaultDate: string
  onClose: () => void
  /** Wird nach erfolgreichem Anlegen aufgerufen (Bericht neu laden). */
  onSaved: () => void
}

const pad = (n: number): string => String(n).padStart(2, '0')

const combineDateAndTime = (dateValue: string, timeValue: string): Date | null => {
  if (!dateValue || !timeValue) return null
  const date = new Date(`${dateValue}T${timeValue}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Neuen (abgeschlossenen) Stempelsatz direkt aus dem Zeiterfassungsbericht anlegen.
 * Der Mitarbeiter ist fest der Mitarbeiter des Berichts; gespeichert wird sofort
 * in die Datenbank (inkl. Überstunden-Neuberechnung im DataService).
 */
const ReportAddEntryModal: React.FC<ReportAddEntryModalProps> = ({
  employeeId,
  employeeName,
  projects,
  defaultDate,
  onClose,
  onSaved
}) => {
  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }, [])

  const [date, setDate] = useState(defaultDate || today)
  const [projectId, setProjectId] = useState('')
  const [clockIn, setClockIn] = useState('07:00')
  const [clockOut, setClockOut] = useState('16:00')
  const [pauseMinutes, setPauseMinutes] = useState(30)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const projectOptions: SearchableOption[] = useMemo(
    () =>
      [...projects]
        .filter((p) => p.id)
        .sort((a, b) => {
          const aArchived = a.status === 'archived' || a.isActive === false
          const bArchived = b.status === 'archived' || b.isActive === false
          if (aArchived !== bArchived) return aArchived ? 1 : -1
          return (a.name || '').localeCompare(b.name || '', 'de')
        })
        .map((p) => ({
          value: p.id,
          label:
            p.status === 'archived' || p.isActive === false
              ? `${p.name || p.id} (archiviert)`
              : p.name || p.id
        })),
    [projects]
  )

  const previewLabel = (): string => {
    const start = combineDateAndTime(date, clockIn)
    const end = combineDateAndTime(date, clockOut)
    if (!start || !end) return '—'
    let minutes = Math.round((end.getTime() - start.getTime()) / 60000)
    if (minutes < 0) minutes += 24 * 60
    minutes -= pauseMinutes
    if (minutes < 0) minutes = 0
    return `${Math.floor(minutes / 60)}:${pad(minutes % 60)} Std`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    if (!projectId) {
      toast.error('Bitte ein Projekt wählen.')
      return
    }
    const clockInTime = combineDateAndTime(date, clockIn)
    const clockOutTime = combineDateAndTime(date, clockOut)
    if (!clockInTime || !clockOutTime) {
      toast.error('Bitte Datum, Kommen und Gehen angeben.')
      return
    }
    // Über Mitternacht: Gehen liegt am Folgetag.
    if (clockOutTime.getTime() <= clockInTime.getTime()) {
      clockOutTime.setDate(clockOutTime.getDate() + 1)
    }
    if (clockOutTime.getTime() > Date.now()) {
      toast.error('Die Zeiten dürfen nicht in der Zukunft liegen.')
      return
    }
    if (pauseMinutes < 0 || pauseMinutes > 24 * 60) {
      toast.error('Pause bitte zwischen 0 und 1440 Minuten angeben.')
      return
    }

    setIsSaving(true)
    try {
      const admin = await DataService.getCurrentAdmin()
      await DataService.addManualCompletedTimeEntry({
        targetEmployeeId: employeeId,
        projectId,
        clockInTime,
        clockOutTime,
        pauseTotalTimeMs: pauseMinutes * 60 * 1000,
        notes: notes.trim() || undefined,
        addedByEmployeeId: admin?.id || 'admin',
        addedByDisplayName: admin?.name || 'Administrator'
      })
      toast.success('Stempelsatz wurde angelegt.')
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || 'Anlegen fehlgeschlagen.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <h2>Stempelsatz hinzufügen</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="form-hint">
            Neuer Stempelsatz für <strong>{employeeName || 'den Mitarbeiter'}</strong>. Er wird
            sofort in der Datenbank gespeichert.
          </p>

          <div className="form-group">
            <label htmlFor="report-add-project">Projekt:</label>
            <SearchableSelect
              id="report-add-project"
              options={projectOptions}
              value={projectId}
              onChange={setProjectId}
              placeholder="Bitte wählen"
              searchPlaceholder="Projekt suchen…"
              emptyText="Kein Projekt gefunden"
            />
          </div>

          <div className="form-group">
            <label htmlFor="report-add-date">Tag:</label>
            <input
              id="report-add-date"
              type="date"
              value={date}
              max={today}
              onChange={(ev) => setDate(ev.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="report-add-in">Kommen:</label>
              <input
                id="report-add-in"
                type="time"
                value={clockIn}
                onChange={(ev) => setClockIn(ev.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="report-add-out">Gehen:</label>
              <input
                id="report-add-out"
                type="time"
                value={clockOut}
                onChange={(ev) => setClockOut(ev.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="report-add-pause">Pause (Minuten):</label>
            <input
              id="report-add-pause"
              type="number"
              min={0}
              max={1440}
              value={pauseMinutes}
              onChange={(ev) => setPauseMinutes(parseInt(ev.target.value, 10) || 0)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="report-add-notes">Notiz (optional):</label>
            <textarea
              id="report-add-notes"
              rows={2}
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              placeholder="z. B. Grund für den Nachtrag"
            />
          </div>

          <div className="duration-preview">
            <span className="preview-label">Berechnete Arbeitszeit:</span>
            <span className="preview-value">{previewLabel()}</span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn secondary-btn" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn primary-btn" disabled={isSaving}>
              {isSaving ? 'Speichert…' : 'Stempelsatz anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ReportAddEntryModal
