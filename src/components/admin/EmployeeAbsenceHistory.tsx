import React, { useEffect, useMemo, useState } from 'react'
import { DataService } from '../../services/dataService'
import type { LeaveRequest, SchoolDayKind } from '../../types'
import { SCHOOL_DAY_LABELS } from '../../types'
import { convertToDate } from '../../services/data/shared'

interface EmployeeAbsenceHistoryProps {
  employeeId: string
}

const TYPE_LABELS: Record<LeaveRequest['type'], string> = {
  vacation: 'Urlaub',
  sick: 'Krank',
  special: 'Sonderurlaub',
  unpaid: 'Unbezahlt',
  overtime: 'Urlaub auf Überstunden',
  school: 'Ausbildung',
}

function formatDay(value: unknown): string {
  const date = convertToDate(value)
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('de-DE')
}

function formatRange(entry: LeaveRequest): string {
  const start = formatDay(entry.startDate)
  const end = formatDay(entry.endDate)
  return start === end ? start : `${start} – ${end}`
}

function labelFor(entry: LeaveRequest): string {
  if (entry.type === 'school' && entry.schoolKind) {
    return SCHOOL_DAY_LABELS[entry.schoolKind as SchoolDayKind]
  }
  return TYPE_LABELS[entry.type] || entry.type
}

/**
 * Abwesenheiten eines Mitarbeiters für den Admin – Krankmeldungen,
 * Ausbildungstage und Urlaub. Bei selbst gemeldeter Krankheit lässt sich die
 * hochgeladene AU-Bescheinigung direkt öffnen.
 */
const EmployeeAbsenceHistory: React.FC<EmployeeAbsenceHistoryProps> = ({ employeeId }) => {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [filter, setFilter] = useState<'sick' | 'school' | 'all'>('sick')

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    DataService.getLeaveRequestsByEmployee(employeeId)
      .then((data) => {
        if (cancelled) return
        const sorted = [...data].sort(
          (a, b) => convertToDate(b.startDate).getTime() - convertToDate(a.startDate).getTime()
        )
        setRequests(sorted)
      })
      .catch((error) => console.error('Fehler beim Laden der Abwesenheiten:', error))
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [employeeId])

  const visible = useMemo(() => {
    if (filter === 'all') return requests
    return requests.filter((entry) => entry.type === filter)
  }, [requests, filter])

  return (
    <div className="employee-absence-history">
      <div className="tab-header">
        <h4>Abwesenheiten</h4>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Abwesenheiten filtern"
        >
          <option value="sick">Nur Krankmeldungen</option>
          <option value="school">Nur Ausbildungstage</option>
          <option value="all">Alle</option>
        </select>
      </div>

      {isLoading ? (
        <p className="absence-history-empty">Lade Abwesenheiten…</p>
      ) : visible.length === 0 ? (
        <p className="absence-history-empty">Keine Einträge vorhanden.</p>
      ) : (
        <ul className="absence-history-list">
          {visible.map((entry) => (
            <li key={entry.id} className="absence-history-item">
              <span className="absence-history-item-range">{formatRange(entry)}</span>
              <span className="absence-history-item-meta">
                {labelFor(entry)} · {entry.workingDays} Arbeitstag
                {entry.workingDays !== 1 ? 'e' : ''}
                {entry.selfReported ? ' · selbst gemeldet' : ''}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </span>

              {entry.type === 'sick' &&
                (entry.sickNoteUrl ? (
                  <button
                    type="button"
                    className="btn secondary-btn absence-history-note-link"
                    onClick={() => setLightbox(entry.sickNoteUrl!)}
                  >
                    AU anzeigen
                  </button>
                ) : (
                  <span className="absence-history-missing-note">kein AU-Nachweis</span>
                ))}
            </li>
          ))}
        </ul>
      )}

      {lightbox && (
        <div className="absence-history-lightbox" onClick={() => setLightbox(null)} role="presentation">
          {/* PDFs lassen sich nicht als Bild anzeigen – dann in neuem Tab öffnen */}
          {lightbox.toLowerCase().includes('.pdf') ? (
            <a
              href={lightbox}
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary-btn"
              onClick={(e) => e.stopPropagation()}
            >
              PDF öffnen
            </a>
          ) : (
            <img src={lightbox} alt="Arbeitsunfähigkeitsbescheinigung" />
          )}
        </div>
      )}
    </div>
  )
}

export default EmployeeAbsenceHistory
