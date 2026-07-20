import React, { useEffect, useMemo, useState } from 'react'
import { DataService } from '../../services/dataService'
import type { Employee, Project, Customer } from '../../types'
import { getEmployeeDisplayName } from '../../utils/employeeDisplayName'
import SearchableSelect, { type SearchableOption } from '../SearchableSelect'
import { toast } from '../ToastContainer'
import '../../styles/Modal.css'

interface AdminClockInModalProps {
  onClose: () => void
  /** Wird nach erfolgreichem Einstempeln aufgerufen (z. B. Dashboard neu laden). */
  onSaved: () => void
}

type ClockInMode = 'project' | 'customer'

/** Aktuelle Uhrzeit als Wert für ein <input type="datetime-local"> (lokale Zeit). */
const nowForInput = (): string => {
  const now = new Date()
  const off = now.getTimezoneOffset()
  return new Date(now.getTime() - off * 60_000).toISOString().slice(0, 16)
}

/**
 * Admin stempelt einen Mitarbeiter direkt ein – z. B. wenn dieser das Einstempeln
 * am Gerät vergessen hat. Auswahl von Mitarbeiter + Projekt/Kunde und Startzeit.
 */
const AdminClockInModal: React.FC<AdminClockInModalProps> = ({ onClose, onSaved }) => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [clockedInIds, setClockedInIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [mode, setMode] = useState<ClockInMode>('project')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [clockInAt, setClockInAt] = useState(nowForInput())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [allEmployees, activeProjects, activeCustomers, currentEntries] = await Promise.all([
          DataService.getAllEmployees(),
          DataService.getActiveProjects(),
          DataService.getActiveCustomers().catch(() => []),
          DataService.getCurrentTimeEntries().catch(() => [])
        ])
        if (cancelled) return
        setEmployees(allEmployees.filter((e) => e.status !== 'inactive'))
        setProjects(activeProjects)
        setCustomers(activeCustomers)
        setClockedInIds(new Set(currentEntries.map((e) => e.employeeId)))
      } catch (error) {
        console.error('Fehler beim Laden der Einstempel-Daten:', error)
        if (!cancelled) toast.error('Daten konnten nicht geladen werden.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const employeeOptions: SearchableOption[] = useMemo(
    () =>
      employees
        .filter((e) => e.id && !clockedInIds.has(e.id))
        .map((e) => ({ value: e.id!, label: getEmployeeDisplayName(e) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [employees, clockedInIds]
  )
  const projectOptions: SearchableOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name || `Projekt ${p.id}` })),
    [projects]
  )
  const customerOptions: SearchableOption[] = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name || 'Unbenannter Kunde' })),
    [customers]
  )

  const alreadyClockedInCount = employees.filter((e) => e.id && clockedInIds.has(e.id)).length

  const canSubmit =
    !!selectedEmployeeId &&
    (mode === 'project' ? !!selectedProjectId : !!selectedCustomerId) &&
    !!clockInAt

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || isSaving) return

    const clockInTime = new Date(clockInAt)
    if (Number.isNaN(clockInTime.getTime())) {
      toast.error('Bitte eine gültige Startzeit angeben.')
      return
    }
    if (clockInTime.getTime() > Date.now() + 60_000) {
      toast.error('Die Startzeit darf nicht in der Zukunft liegen.')
      return
    }

    setIsSaving(true)
    try {
      const isCustomerEntry = mode === 'customer'
      const customer = customers.find((c) => c.id === selectedCustomerId)
      await DataService.addTimeEntry({
        employeeId: selectedEmployeeId,
        projectId: isCustomerEntry ? '' : selectedProjectId,
        ...(isCustomerEntry
          ? { customerId: selectedCustomerId, customerName: customer?.name || '' }
          : {}),
        clockInTime,
        notes: 'Eingestempelt durch Admin'
      })

      const employee = employees.find((emp) => emp.id === selectedEmployeeId)
      toast.success(`${getEmployeeDisplayName(employee)} wurde eingestempelt.`)
      onSaved()
    } catch (error: any) {
      toast.error('Fehler beim Einstempeln: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <h2>Mitarbeiter einstempeln</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {isLoading ? (
          <div className="loading">Daten werden geladen…</div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label htmlFor="admin-clockin-employee">Mitarbeiter:</label>
              {employeeOptions.length === 0 ? (
                <p className="no-data">
                  Alle aktiven Mitarbeiter sind bereits eingestempelt.
                </p>
              ) : (
                <SearchableSelect
                  id="admin-clockin-employee"
                  options={employeeOptions}
                  value={selectedEmployeeId}
                  onChange={setSelectedEmployeeId}
                  placeholder="Bitte wählen"
                  searchPlaceholder="Mitarbeiter suchen…"
                  emptyText="Kein Mitarbeiter gefunden"
                />
              )}
              {alreadyClockedInCount > 0 && (
                <small className="form-hint">
                  {alreadyClockedInCount} Mitarbeiter bereits eingestempelt (ausgeblendet).
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Buchen auf:</label>
              <div className="clock-in-mode-toggle" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'project'}
                  className={`btn ${mode === 'project' ? 'primary-btn' : 'secondary-btn'}`}
                  onClick={() => setMode('project')}
                >
                  Projekt
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'customer'}
                  className={`btn ${mode === 'customer' ? 'primary-btn' : 'secondary-btn'}`}
                  onClick={() => setMode('customer')}
                >
                  Kunde (Kleinauftrag)
                </button>
              </div>
            </div>

            {mode === 'project' ? (
              <div className="form-group">
                <label htmlFor="admin-clockin-project">Projekt:</label>
                <SearchableSelect
                  id="admin-clockin-project"
                  options={projectOptions}
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  placeholder="Bitte wählen"
                  searchPlaceholder="Projekt suchen…"
                  emptyText="Kein Projekt gefunden"
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="admin-clockin-customer">Kunde:</label>
                {customers.length === 0 ? (
                  <p className="no-data">Keine Kunden vorhanden.</p>
                ) : (
                  <SearchableSelect
                    id="admin-clockin-customer"
                    options={customerOptions}
                    value={selectedCustomerId}
                    onChange={setSelectedCustomerId}
                    placeholder="Bitte wählen"
                    searchPlaceholder="Kunde suchen…"
                    emptyText="Kein Kunde gefunden"
                  />
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="admin-clockin-time">Startzeit:</label>
              <input
                id="admin-clockin-time"
                type="datetime-local"
                value={clockInAt}
                max={nowForInput()}
                onChange={(ev) => setClockInAt(ev.target.value)}
              />
              <small className="form-hint">
                Standard ist die aktuelle Uhrzeit – bei Bedarf anpassen.
              </small>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn secondary-btn">
                Abbrechen
              </button>
              <button type="submit" className="btn primary-btn" disabled={!canSubmit || isSaving}>
                {isSaving ? 'Wird eingestempelt…' : 'Einstempeln'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default AdminClockInModal
