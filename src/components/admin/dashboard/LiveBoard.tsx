import { convertToDate } from '../../../services/data/shared'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { DataService } from '../../../services/dataService'
import { getClockInCoordinates } from '../../../utils/geoDisplay'
import { getFileImageSrc } from '../../../utils/fileImageSrc'
import { reverseGeocode } from '../../../utils/reverseGeocode'
import { ProjectOfferDetails } from '../../ProjectOfferDetails'
import EmployeeAvatar from '../../EmployeeAvatar'
import { getEmployeeDisplayName, getEmployeeInitials } from '../../../utils/employeeDisplayName'
import type { DashboardContext, LiveActivity } from './types'
import '../../../styles/ProjectSiteCard.css'
import '../../../styles/LiveBoard.css'

const LiveMap = lazy(() => import('./LiveMap'))

const employeeName = (activity: LiveActivity) =>
  getEmployeeDisplayName(activity.employee) ||
  'Unbekannter Mitarbeiter'

const since = (activity: LiveActivity) => convertToDate(activity.timeEntry.clockInTime)

const clockTime = (date: Date) => date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

const durationLabel = (ms: number) => {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** Adresse zum GPS-Punkt; bis sie da ist (oder wenn der Dienst ausfällt) die Koordinaten. */
function Address({ lat, lng }: { lat: number; lng: number }) {
  const key = `${lat},${lng}`
  const [address, setAddress] = useState({ key: '', text: '' })
  useEffect(() => {
    let current = true
    reverseGeocode(lat, lng).then((found) => { if (current) setAddress({ key, text: found }) }).catch(() => undefined)
    return () => { current = false }
  }, [key, lat, lng])
  return <>{address.key === key && address.text || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</>
}

/** Fotos der Live-Dokumentation dieser Buchung (die neuesten zuerst). */
function usePhotos(activity: LiveActivity) {
  const ids = [...new Set((activity.timeEntry.liveDocumentation ?? []).flatMap((doc) => doc.imageIds ?? []))].slice(-8).reverse()
  const key = ids.join(',')
  const [photos, setPhotos] = useState<{ key: string; list: { id: string; src: string }[] }>({ key: '', list: [] })
  useEffect(() => {
    if (!key) return
    let current = true
    Promise.all(key.split(',').map((id) => DataService.getFileUploadById(id)))
      .then((files) => {
        if (!current) return
        setPhotos({ key, list: files.flatMap((file) => (file && getFileImageSrc(file) ? [{ id: file.id, src: getFileImageSrc(file) }] : [])) })
      })
      .catch(() => undefined)
    return () => { current = false }
  }, [key])
  return photos.key === key ? photos.list : []
}

/** Tagesblatt eines Mitarbeiters: Zeit, Standort, Doku, Material und worum es im Projekt geht. */
function LiveDetail({ activity, onClose, onClockOut, clockingOut }: {
  activity: LiveActivity
  onClose: () => void
  onClockOut: () => void
  clockingOut: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const start = since(activity)
  const ms = Math.max(0, now - start.getTime())
  const pad = (value: number) => String(Math.floor(value)).padStart(2, '0')
  const timer = `${pad(ms / 3_600_000)}:${pad((ms % 3_600_000) / 60_000)}:${pad((ms % 60_000) / 1000)}`
  const coords = getClockInCoordinates(activity.timeEntry)
  const { timeEntry: entry, project } = activity
  const notes = (entry.liveDocumentation ?? []).map((doc) => doc.notes.trim()).filter(Boolean)
  const photos = usePhotos(activity)
  const name = employeeName(activity)

  return (
    <aside className="live-detail" aria-label={`Tagesblatt ${name}`}>
      <header className="live-detail-head">
        <EmployeeAvatar name={name} photo={activity.employee?.profileImage} />
        <div>
          <h3>{name}</h3>
          <p>{project?.name || entry.customerName || 'Kein Projekt'}</p>
        </div>
        <button type="button" className="live-detail-close" onClick={onClose} aria-label="Tagesblatt schließen">×</button>
      </header>

      <div className="live-detail-timer">
        <span className="live-detail-timer-value">{timer}</span>
        <span>eingestempelt seit {clockTime(start)}</span>
      </div>

      {coords && (
        <section>
          <h4>Standort beim Einstempeln</h4>
          <p><Address lat={coords.lat} lng={coords.lng} /></p>
          <a href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a>
        </section>
      )}

      {(photos.length > 0 || notes.length > 0) && (
        <section>
          <h4>Dokumentation heute</h4>
          {notes.map((note, index) => <p key={index} className="live-detail-note">{note}</p>)}
          {photos.length > 0 && (
            <div className="live-detail-photos">
              {photos.map((photo) => <a key={photo.id} href={photo.src} target="_blank" rel="noopener noreferrer"><img src={photo.src} alt="Baustellenfoto" loading="lazy" /></a>)}
            </div>
          )}
        </section>
      )}

      {!!entry.materialUsages?.length && (
        <section>
          <h4>Material</h4>
          <ul className="live-detail-list">
            {entry.materialUsages.map((usage, index) => (
              <li key={index}><span>{usage.materialName || 'Material'}</span><strong>{usage.quantity.toLocaleString('de-DE')} {usage.unitLabel}</strong></li>
            ))}
          </ul>
        </section>
      )}

      {project && (
        <section>
          <h4>Projekt</h4>
          <p><strong>{project.name}</strong></p>
          {(project.client || project.customerName) && <p>{project.client || project.customerName}</p>}
          {(project.address || project.location) && <p>{project.address || project.location}</p>}
          {project.description && <p className="live-detail-description">{project.description}</p>}
          <ProjectOfferDetails project={project} />
        </section>
      )}

      <button type="button" className="btn secondary-btn live-detail-clockout" disabled={clockingOut} onClick={onClockOut}>
        {clockingOut ? 'Wird ausgestempelt …' : 'Ausstempeln'}
      </button>
    </aside>
  )
}

/** Live-Lage: Liste der Eingestempelten, Karte mit Markern und Tagesblatt zur Auswahl. */
export default function LiveBoard({ ctx }: { ctx: DashboardContext }) {
  const { liveActivities, nowTick, clockingOutId, onAdminClockOut } = ctx.data
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = liveActivities.find((activity) => activity.timeEntry.id === selectedId) ?? null

  const points = useMemo(() => liveActivities.flatMap((activity) => {
    const coords = getClockInCoordinates(activity.timeEntry)
    const name = employeeName(activity)
    return coords ? [{ id: activity.timeEntry.id, ...coords, label: getEmployeeInitials(name), title: name, photo: activity.employee?.profileImage }] : []
  }), [liveActivities])

  if (liveActivities.length === 0) return <p className="dw-empty">Aktuell ist niemand eingestempelt.</p>

  return (
    <div className="live-board">
      <div className={`live-grid${selected ? ' has-detail' : ''}`}>
        <ul className="live-list">
          {liveActivities.map((activity) => {
            const id = activity.timeEntry.id
            const name = employeeName(activity)
            const coords = getClockInCoordinates(activity.timeEntry)
            const start = since(activity)
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`live-item${id === selectedId ? ' is-selected' : ''}`}
                  aria-pressed={id === selectedId}
                  onClick={() => setSelectedId(id === selectedId ? null : id)}
                >
                  <EmployeeAvatar name={name} photo={activity.employee?.profileImage} />
                  <span className="live-item-text">
                    <strong>{name}</strong>
                    <span>{activity.project?.name || activity.timeEntry.customerName || 'Kein Projekt'}</span>
                    <small>{coords ? <Address lat={coords.lat} lng={coords.lng} /> : 'Kein Standort übermittelt'}</small>
                  </span>
                  <span className="live-item-time">
                    <strong>{durationLabel(nowTick - start.getTime())}</strong>
                    <small>seit {clockTime(start)}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="live-map">
          <Suspense fallback={<div className="live-map-note">Karte wird geladen …</div>}>
            <LiveMap points={points} selectedId={selectedId} onSelect={setSelectedId} />
          </Suspense>
          {points.length === 0 && <div className="live-map-note">Noch kein Standort übermittelt</div>}
        </div>

        {selected && (
          <LiveDetail
            key={selected.timeEntry.id}
            activity={selected}
            onClose={() => setSelectedId(null)}
            onClockOut={() => onAdminClockOut(selected.timeEntry, employeeName(selected))}
            clockingOut={clockingOutId === selected.timeEntry.id}
          />
        )}
      </div>
    </div>
  )
}
