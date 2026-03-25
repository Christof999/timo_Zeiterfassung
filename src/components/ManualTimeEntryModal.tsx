import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { Employee, Project } from '../types'
import { toast } from './ToastContainer'
import '../styles/Modal.css'
import '../styles/Login.css'

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function employeeLabel(e: Employee): string {
  const parts = `${e.firstName || ''} ${e.lastName || ''}`.trim()
  return (e.name?.trim() || parts || e.username || e.id || '').trim()
}

interface ManualTimeEntryModalProps {
  addedBy: Employee
  onClose: () => void
  onSuccess: () => void
}

const ManualTimeEntryModal: React.FC<ManualTimeEntryModalProps> = ({
  addedBy,
  onClose,
  onSuccess
}) => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [targetEmployeeId, setTargetEmployeeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [clockInLocal, setClockInLocal] = useState('')
  const [clockOutLocal, setClockOutLocal] = useState('')
  const [pauseMinutes, setPauseMinutes] = useState(0)
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    const run = async () => {
      setIsBootstrapping(true)
      try {
        const [emps, projs] = await Promise.all([
          DataService.getAllActiveEmployees(),
          DataService.getActiveProjects()
        ])
        const byId = new Map(emps.map((e) => [e.id, e]))
        if (addedBy.id && !byId.has(addedBy.id)) {
          byId.set(addedBy.id, addedBy)
        }
        const merged = Array.from(byId.values())
        const sorted = merged.sort((a, b) =>
          employeeLabel(a).localeCompare(employeeLabel(b), 'de')
        )
        setEmployees(sorted)
        setProjects(projs.filter((p) => p.id))

        const selfId = addedBy.id || ''
        setTargetEmployeeId(selfId)

        const end = new Date()
        const start = new Date(end)
        start.setHours(7, 0, 0, 0)
        if (start.getTime() >= end.getTime()) {
          start.setTime(end.getTime() - 3 * 60 * 60 * 1000)
        }
        setClockInLocal(toDatetimeLocalValue(start))
        setClockOutLocal(toDatetimeLocalValue(end))

        if (projs.length === 1 && projs[0].id) {
          setProjectId(projs[0].id)
        }
      } catch (e) {
        console.error(e)
        toast.error('Daten konnten nicht geladen werden.')
      } finally {
        setIsBootstrapping(false)
      }
    }
    run()
  }, [addedBy.id])

  const addedByDisplayName =
    employeeLabel(addedBy) || addedBy.username || 'Unbekannt'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addedBy.id) {
      toast.error('Ihre Benutzer-ID fehlt.')
      return
    }
    if (!targetEmployeeId) {
      toast.error('Bitte wählen Sie einen Mitarbeiter.')
      return
    }
    if (!projectId) {
      toast.error('Bitte wählen Sie ein Projekt.')
      return
    }
    if (!clockInLocal || !clockOutLocal) {
      toast.error('Bitte Start- und Endzeit angeben.')
      return
    }

    const clockInTime = new Date(clockInLocal)
    const clockOutTime = new Date(clockOutLocal)
    if (Number.isNaN(clockInTime.getTime()) || Number.isNaN(clockOutTime.getTime())) {
      toast.error('Ungültiges Datum oder Uhrzeit.')
      return
    }
    if (clockOutTime.getTime() <= clockInTime.getTime()) {
      toast.error('Endzeit muss nach der Startzeit liegen.')
      return
    }
    const now = Date.now()
    if (clockInTime.getTime() > now || clockOutTime.getTime() > now) {
      toast.error('Zeiten dürfen nicht in der Zukunft liegen.')
      return
    }
    if (pauseMinutes < 0 || pauseMinutes > 24 * 60) {
      toast.error('Pause in Minuten bitte zwischen 0 und 1440.')
      return
    }

    setIsLoading(true)
    try {
      await DataService.addManualCompletedTimeEntry({
        targetEmployeeId,
        projectId,
        clockInTime,
        clockOutTime,
        pauseTotalTimeMs: pauseMinutes * 60 * 1000,
        notes: notes.trim() || undefined,
        addedByEmployeeId: addedBy.id,
        addedByDisplayName
      })
      toast.success('Stempelzeit wurde nachträglich gespeichert.')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Speichern fehlgeschlagen.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Stempelzeit nachtragen</h2>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body manual-time-entry-body">
          {isBootstrapping ? (
            <div className="loading">Lade Formular…</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="manual-time-entry-hint">
                Erfassen Sie eine vergessene oder korrigierte Arbeitszeit mit Start und Ende. Der
                Mitarbeiter muss dafür nicht ausgestempelt sein.
              </p>

              <div className="form-group">
                <label htmlFor="manual-entry-employee">Mitarbeiter</label>
                <select
                  id="manual-entry-employee"
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id || emp.username} value={emp.id}>
                      {employeeLabel(emp)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="manual-entry-project">Projekt</label>
                <select
                  id="manual-entry-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="manual-entry-start">Start (Datum &amp; Uhrzeit)</label>
                <input
                  id="manual-entry-start"
                  type="datetime-local"
                  value={clockInLocal}
                  onChange={(e) => setClockInLocal(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="manual-entry-end">Ende (Datum &amp; Uhrzeit)</label>
                <input
                  id="manual-entry-end"
                  type="datetime-local"
                  value={clockOutLocal}
                  onChange={(e) => setClockOutLocal(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="manual-entry-pause">Pause (Minuten)</label>
                <input
                  id="manual-entry-pause"
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  value={pauseMinutes}
                  onChange={(e) => setPauseMinutes(parseInt(e.target.value, 10) || 0)}
                />
                <small>Optional, z. B. Mittagspause (wird von der Arbeitszeit abgezogen).</small>
              </div>

              <div className="form-group">
                <label htmlFor="manual-entry-notes">Notiz (optional)</label>
                <textarea
                  id="manual-entry-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="z. B. Grund für den Nachtrag"
                />
              </div>

              <div className="form-group text-center">
                <button type="submit" className="btn primary-btn" disabled={isLoading}>
                  {isLoading ? 'Speichere…' : 'Nachtrag speichern'}
                </button>
                <button type="button" className="btn secondary-btn" onClick={onClose}>
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManualTimeEntryModal
