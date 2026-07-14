import React, { useEffect, useState } from 'react'
import { DataService } from '../../services/dataService'
import type { TimeEntry, Project } from '../../types'
import {
  convertToDate,
  workMinutesFromOriginalEntry,
  minutesToHoursLabel
} from './tabs/reports/reportUtils'
import '../../styles/EmployeeTimeEntries.css'

interface EmployeeTimeEntriesSectionProps {
  employeeId: string
  onSelectEntry: (entry: TimeEntry, project: Project | null) => void
}

/** Wie viele Stempelsätze im Mitarbeiter-Fenster geladen werden. */
const ENTRY_LIMIT = 100

const EmployeeTimeEntriesSection: React.FC<EmployeeTimeEntriesSectionProps> = ({
  employeeId,
  onSelectEntry
}) => {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [projectsById, setProjectsById] = useState<Map<string, Project>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      DataService.getRecentTimeEntriesByEmployeeId(employeeId, ENTRY_LIMIT),
      DataService.getAllProjects()
    ])
      .then(([list, projects]) => {
        if (cancelled) return
        setEntries(list)
        setProjectsById(new Map(projects.map((p) => [p.id, p])))
      })
      .catch((error) => {
        console.error('Stempelzeiten konnten nicht geladen werden:', error)
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [employeeId])

  const projectFor = (entry: TimeEntry): Project | null =>
    entry.projectId ? projectsById.get(entry.projectId) || null : null

  const whereLabel = (entry: TimeEntry): string => {
    if (entry.projectId) return projectFor(entry)?.name || 'Projekt'
    if (entry.customerName) return `Kleinauftrag: ${entry.customerName}`
    return '—'
  }

  const fmtDate = (d: Date | null): string =>
    d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const fmtTime = (d: Date | null): string =>
    d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="ete-section">
      <h3 className="ete-title">Stempelzeiten</h3>
      {isLoading ? (
        <p className="ete-loading">Stempelzeiten werden geladen…</p>
      ) : entries.length === 0 ? (
        <p className="ete-empty">Keine Stempelzeiten vorhanden.</p>
      ) : (
        <>
          <p className="ete-hint">Tippen Sie auf einen Eintrag, um den Stempel-Bericht zu öffnen.</p>
          <ul className="ete-list">
            {entries.map((entry) => {
              const clockIn = convertToDate(entry.clockInTime)
              const clockOut = entry.clockOutTime ? convertToDate(entry.clockOutTime) : null
              const durationLabel = clockOut
                ? `${minutesToHoursLabel(workMinutesFromOriginalEntry(entry))} h`
                : 'läuft'
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="ete-row"
                    onClick={() => onSelectEntry(entry, projectFor(entry))}
                  >
                    <span className="ete-row-main">
                      <span className="ete-row-date">{fmtDate(clockIn)}</span>
                      <span className="ete-row-where">{whereLabel(entry)}</span>
                    </span>
                    <span className="ete-row-side">
                      <span className="ete-row-times">
                        {fmtTime(clockIn)}–{clockOut ? fmtTime(clockOut) : '…'}
                      </span>
                      <span className={`ete-row-duration ${clockOut ? '' : 'ete-running'}`}>
                        {durationLabel}
                      </span>
                    </span>
                    <span className="ete-row-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export default EmployeeTimeEntriesSection
