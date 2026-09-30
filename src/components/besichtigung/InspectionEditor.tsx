import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DataService } from '../../services/dataService'
import { deleteInspection, getInspection, saveInspection } from '../../services/data/inspections'
import type { Customer } from '../../types'
import type { Inspection, InspectionRoom } from '../../types/inspection'
import { newId, roomSummary } from '../../utils/roomGeometry'
import SearchableSelect from '../SearchableSelect'
import { toast } from '../ToastContainer'
import LvSection from './LvSection'
import PhotosSection from './PhotosSection'
import RoomEditor from './RoomEditor'
import '../../styles/Besichtigung.css'

const SAVE_DELAY_MS = 800

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** Adresse aus den Koordinaten – OpenStreetMap, ohne Schlüssel. */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=de`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  const a = data?.address || {}
  const street = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(' ')
  const city = [a.postcode, a.city || a.town || a.village || a.municipality].filter(Boolean).join(' ')
  return [street, city].filter(Boolean).join(', ') || data?.display_name || ''
}

const InspectionEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<'list' | 'new'>('list')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [isLocating, setIsLocating] = useState(false)
  const [uploader, setUploader] = useState('admin')

  const latest = useRef<Inspection | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const load = async () => {
      const admin = await DataService.getCurrentAdmin()
      if (!admin || !admin.isAdmin) {
        navigate('/admin/login')
        return
      }
      setUploader(admin.id || admin.username || 'admin')
      if (!id) return
      const [loaded, allCustomers] = await Promise.all([getInspection(id), DataService.getActiveCustomers()])
      if (!loaded) {
        toast.error('Besichtigung nicht gefunden')
        navigate('/admin/dashboard', { state: { tab: 'inspections' } })
        return
      }
      setCustomers(allCustomers)
      setCustomerMode(loaded.customerId || !loaded.customerName ? 'list' : 'new')
      latest.current = loaded
      setInspection(loaded)
    }
    load().catch((error) => {
      console.error('Besichtigung konnte nicht geladen werden:', error)
      toast.error('Besichtigung konnte nicht geladen werden')
    })
  }, [id, navigate])

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const current = latest.current
    if (!current) return
    setSaveState('saving')
    try {
      await saveInspection(current)
      // Nur „gespeichert“ melden, wenn inzwischen nichts Neues dazukam.
      setSaveState(latest.current === current ? 'saved' : 'dirty')
    } catch (error) {
      console.error('Speichern fehlgeschlagen:', error)
      setSaveState('error')
    }
  }, [])

  // Beim Verlassen der Seite noch ausstehende Änderungen sichern.
  useEffect(() => () => {
    if (timer.current) void flush()
  }, [flush])

  const update = useCallback(
    (patch: Partial<Inspection>) => {
      setInspection((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...patch }
        latest.current = next
        return next
      })
      setSaveState('dirty')
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush]
  )

  const roomSummaries = useMemo(() => (inspection ? inspection.rooms.map(roomSummary) : []), [inspection])

  if (!inspection) {
    return <div className="loading">Lade Besichtigung…</div>
  }

  const selectCustomer = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) return
    update({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || inspection.customerPhone,
      customerEmail: customer.email || inspection.customerEmail,
      address: inspection.address || customer.address || ''
    })
  }

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error('Standort wird von diesem Gerät nicht unterstützt.')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }
        try {
          const address = await reverseGeocode(geo.lat, geo.lng)
          update({ geo, address: address || inspection.address })
          if (!address) toast.error('Zum Standort wurde keine Adresse gefunden.')
        } catch {
          update({ geo })
          toast.error('Standort gespeichert, aber die Adresse konnte nicht ermittelt werden.')
        } finally {
          setIsLocating(false)
        }
      },
      (error) => {
        setIsLocating(false)
        toast.error(error.code === error.PERMISSION_DENIED ? 'Standortfreigabe wurde abgelehnt.' : 'Standort nicht ermittelbar.')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const addRoom = () => {
    const room: InspectionRoom = {
      id: newId('room'),
      name: inspection.rooms.length === 0 ? 'Bad' : `Raum ${inspection.rooms.length + 1}`,
      height: 2.5,
      walls: [],
      objects: [],
      notes: []
    }
    update({ rooms: [...inspection.rooms, room] })
  }

  const updateRoom = (room: InspectionRoom) => {
    update({ rooms: inspection.rooms.map((r) => (r.id === room.id ? room : r)) })
  }

  const removeRoom = (room: InspectionRoom) => {
    if (!confirm(`Raum "${room.name}" mit allen Maßen löschen?`)) return
    update({ rooms: inspection.rooms.filter((r) => r.id !== room.id) })
  }

  const goBack = async () => {
    await flush()
    navigate('/admin/dashboard', { state: { tab: 'inspections' } })
  }

  const handleDelete = async () => {
    if (!confirm('Diese Besichtigung mit allen Fotos endgültig löschen?')) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    latest.current = null
    try {
      await deleteInspection(inspection)
      toast.success('Besichtigung gelöscht')
      navigate('/admin/dashboard', { state: { tab: 'inspections' } })
    } catch (error: any) {
      toast.error('Löschen fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    }
  }

  const saveLabel = { saved: 'Gespeichert', dirty: 'Ungespeichert', saving: 'Speichert…', error: 'Nicht gespeichert!' }[saveState]

  return (
    <div className="inspection-page">
      <header className="inspection-header">
        <button type="button" className="icon-btn" onClick={goBack} aria-label="Zurück">
          ←
        </button>
        <div className="inspection-header-title">
          <h1>Besichtigung</h1>
          <span className={`save-state ${saveState}`} onClick={saveState === 'error' ? () => void flush() : undefined}>
            {saveLabel}
          </span>
        </div>
        <button type="button" className="icon-btn danger" onClick={handleDelete} aria-label="Besichtigung löschen">
          🗑
        </button>
      </header>

      {inspection.offerNumber && (
        <div className="offer-banner">Angebot {inspection.offerNumber} wurde im Rechnungsprogramm erstellt.</div>
      )}

      <section className="inspection-card">
        <h2>Kunde</h2>
        <div className="segmented">
          <button type="button" className={customerMode === 'list' ? 'active' : ''} onClick={() => setCustomerMode('list')}>
            Aus Kundenliste
          </button>
          <button
            type="button"
            className={customerMode === 'new' ? 'active' : ''}
            onClick={() => {
              setCustomerMode('new')
              if (inspection.customerId) update({ customerId: undefined })
            }}
          >
            Neuer Kunde
          </button>
        </div>
        {customerMode === 'list' ? (
          <SearchableSelect
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            value={inspection.customerId || ''}
            onChange={selectCustomer}
            placeholder="Kunde wählen"
            searchPlaceholder="Name suchen…"
          />
        ) : (
          <input
            className="full-input"
            value={inspection.customerName}
            onChange={(e) => update({ customerName: e.target.value })}
            placeholder="Name des Kunden"
            autoComplete="off"
          />
        )}
        <div className="inline-row">
          <input
            type="tel"
            value={inspection.customerPhone || ''}
            onChange={(e) => update({ customerPhone: e.target.value })}
            placeholder="Telefon"
          />
          <input
            type="email"
            value={inspection.customerEmail || ''}
            onChange={(e) => update({ customerEmail: e.target.value })}
            placeholder="E-Mail"
          />
        </div>
      </section>

      <section className="inspection-card">
        <h2>Baustelle</h2>
        <div className="address-row">
          <input
            value={inspection.address}
            onChange={(e) => update({ address: e.target.value })}
            placeholder="Straße, PLZ Ort"
            autoComplete="street-address"
          />
          <button type="button" className="btn secondary-btn" onClick={locate} disabled={isLocating}>
            {isLocating ? '…' : '📍 Standort'}
          </button>
        </div>
        {inspection.geo && (
          <a
            className="hint"
            href={`https://www.openstreetmap.org/?mlat=${inspection.geo.lat}&mlon=${inspection.geo.lng}#map=19/${inspection.geo.lat}/${inspection.geo.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Standort auf der Karte (± {inspection.geo.accuracy ?? '?'} m)
          </a>
        )}
      </section>

      <section className="inspection-card">
        <h2>Was soll gemacht werden?</h2>
        <LvSection
          description={inspection.description}
          lvTitle={inspection.lvTitle}
          lvText={inspection.lvText}
          positions={inspection.lvPositions}
          roomSummaries={roomSummaries}
          onChange={update}
        />
      </section>

      <section className="inspection-card">
        <h2>Räume</h2>
        {inspection.rooms.map((room) => (
          <RoomEditor key={room.id} room={room} onChange={updateRoom} onDelete={() => removeRoom(room)} />
        ))}
        <button type="button" className="btn secondary-btn full-width" onClick={addRoom}>
          + Raum messen
        </button>
      </section>

      <section className="inspection-card">
        <h2>Fotos & Fliesen</h2>
        <PhotosSection
          inspectionId={inspection.id}
          uploader={uploader}
          photos={inspection.photos}
          visualizations={inspection.visualizations}
          onChange={update}
        />
      </section>
    </div>
  )
}

export default InspectionEditor
