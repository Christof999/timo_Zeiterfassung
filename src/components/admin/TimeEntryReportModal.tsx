import React from 'react'
import type { TimeEntry, Project } from '../../types'
import {
  convertToDate,
  workMinutesFromOriginalEntry,
  minutesToHoursLabel,
  entryCreditMinutes
} from './tabs/reports/reportUtils'
import '../../styles/Modal.css'
import '../../styles/EmployeeTimeEntries.css'

interface TimeEntryReportModalProps {
  entry: TimeEntry
  project?: Project | null
  onClose: () => void
}

/** Koordinaten aus GeoPoint oder { lat/lng } bzw. { latitude/longitude } lesen. */
const coordsFromLocation = (loc: unknown): { lat: number; lng: number } | null => {
  if (!loc || typeof loc !== 'object') return null
  const o = loc as Record<string, unknown> & { toJSON?: () => { latitude: number; longitude: number } }
  if (typeof o.toJSON === 'function') {
    try {
      const j = o.toJSON()
      if (Number.isFinite(j.latitude) && Number.isFinite(j.longitude)) {
        return { lat: j.latitude, lng: j.longitude }
      }
    } catch {
      /* ignore */
    }
  }
  const lat = (o.latitude ?? o.lat) as number
  const lng = (o.longitude ?? o.lng) as number
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

const formatDate = (d: Date | null): string =>
  d
    ? d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

const formatTime = (d: Date | null): string =>
  d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

const LocationLink: React.FC<{ coords: { lat: number; lng: number } | null }> = ({ coords }) => {
  if (!coords) return <span>—</span>
  return (
    <a
      href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
    </a>
  )
}

const TimeEntryReportModal: React.FC<TimeEntryReportModalProps> = ({ entry, project, onClose }) => {
  const clockIn = convertToDate(entry.clockInTime)
  const clockOut = entry.clockOutTime ? convertToDate(entry.clockOutTime) : null
  const pauseMinutes = Math.round((entry.pauseTotalTime || 0) / 60000)
  const workMinutes = workMinutesFromOriginalEntry(entry)
  const creditMinutes = entryCreditMinutes(entry)

  const whereLabel = entry.projectId
    ? project?.name || 'Projekt'
    : entry.customerName
      ? `Kleinauftrag: ${entry.customerName}`
      : '—'

  const inCoords = coordsFromLocation(entry.clockInLocation)
  const outCoords = coordsFromLocation((entry as any).clockOutLocation)
  const materials = entry.materialUsages || []

  return (
    <div className="modal-overlay ete-report-overlay" onClick={onClose}>
      <div className="modal-content ete-report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Stempel-Bericht</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div className="modal-body">
          <dl className="ete-report-grid">
            <dt>Datum</dt>
            <dd>{formatDate(clockIn)}</dd>

            <dt>Projekt / Auftrag</dt>
            <dd>{whereLabel}</dd>

            <dt>Kommen</dt>
            <dd>{formatTime(clockIn)}</dd>

            <dt>Gehen</dt>
            <dd>{clockOut ? formatTime(clockOut) : 'läuft noch'}</dd>

            <dt>Pause</dt>
            <dd>{pauseMinutes} Min</dd>

            <dt>Arbeitszeit (netto)</dt>
            <dd><strong>{minutesToHoursLabel(workMinutes)} h</strong></dd>

            {creditMinutes > 0 && (
              <>
                <dt>Rückfahrt-Gutschrift</dt>
                <dd>{creditMinutes} Min</dd>
              </>
            )}

            <dt>Einstempel-Ort</dt>
            <dd><LocationLink coords={inCoords} /></dd>

            <dt>Ausstempel-Ort</dt>
            <dd><LocationLink coords={outCoords} /></dd>
          </dl>

          {materials.length > 0 && (
            <div className="ete-report-section">
              <h4>Material</h4>
              <ul className="ete-report-materials">
                {materials.map((m, i) => (
                  <li key={i}>
                    {m.materialName}
                    {' — '}
                    {Number(m.quantity).toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                    {m.unitLabel ? ` ${m.unitLabel}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(entry.notes || '').trim() && (
            <div className="ete-report-section">
              <h4>Notizen</h4>
              <p className="ete-report-notes">{entry.notes}</p>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn primary-btn" onClick={onClose}>Schließen</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimeEntryReportModal
