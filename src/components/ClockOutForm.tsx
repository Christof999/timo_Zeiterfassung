import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Project, Vehicle, VehicleUsage } from '../types'
import VehicleBookingModal from './VehicleBookingModal'
import ExtendedClockOutModal from './ExtendedClockOutModal'
import LiveDocumentationModal from './LiveDocumentationModal'
import { toast } from './ToastContainer'
import '../styles/ClockOutForm.css'

interface ClockOutFormProps {
  timeEntry: TimeEntry
  project: Project | null
  clockInTime: Date | null
  onSimpleClockOut: (pauseMinutes: number) => void
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
  const [showVehicleModal, setShowVehicleModal] = useState(false)
  const [showExtendedModal, setShowExtendedModal] = useState(false)
  const [showLiveDocModal, setShowLiveDocModal] = useState(false)
  const [vehicleBookings, setVehicleBookings] = useState<VehicleUsage[]>([])
  /** Leer = noch nicht bestätigt; „0“ ist gültig */
  const [pauseMinutesInput, setPauseMinutesInput] = useState('')
  /** Beim Öffnen „Mit Dokumentation“ festgehaltene Pausenzeit (ms), damit das Modal nicht durch nachträgliche Eingabe ungültig wird */
  const [pauseMsForExtendedModal, setPauseMsForExtendedModal] = useState<number | null>(null)

  useEffect(() => {
    loadVehicleBookings()
  }, [])

  const loadVehicleBookings = async () => {
    try {
      const [bookings, vehicles, user] = await Promise.all([
        DataService.getVehicleUsagesByProject(timeEntry.projectId),
        DataService.getAllVehicles(),
        DataService.getCurrentUser()
      ])

      const formatDateToKey = (value: any): string => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value
        }

        const asDate = value instanceof Date
          ? value
          : value?.toDate?.()
            ? value.toDate()
            : typeof value === 'string'
              ? new Date(value)
              : null

        if (!asDate || isNaN(asDate.getTime())) {
          return typeof value === 'string' ? value : ''
        }

        const year = asDate.getFullYear()
        const month = String(asDate.getMonth() + 1).padStart(2, '0')
        const day = String(asDate.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const today = formatDateToKey(new Date())
      const vehicleNameById = new Map<string, string>(
        (vehicles || []).map((vehicle: Vehicle) => [String(vehicle.id), vehicle.name])
      )

      const myBookings = bookings
        .filter((booking) => {
          const bookingDate = formatDateToKey(booking.date)
          return booking.employeeId === user?.id && bookingDate === today
        })
        .map((booking) => ({
          ...booking,
          vehicleName:
            booking.vehicleName ||
            vehicleNameById.get(String(booking.vehicleId)) ||
            'Unbekanntes Fahrzeug'
        }))

      setVehicleBookings(myBookings)
    } catch (error) {
      console.error('Fehler beim Laden der Fahrzeugbuchungen:', error)
    }
  }

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
    onSimpleClockOut(minutes)
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

      {vehicleBookings.length > 0 && (
        <div className="current-vehicle-bookings">
          <h4>Gebuchte Fahrzeuge heute:</h4>
          <div className="vehicle-bookings-list">
            {vehicleBookings.map((booking) => (
              <div key={booking.id} className="booking-item">
                <div className="booking-item-details">
                  <div className="booking-item-vehicle">
                    {booking.vehicleName || 'Unbekanntes Fahrzeug'}
                  </div>
                  {booking.hoursUsed && (
                    <div className="booking-item-hours">
                      {booking.hoursUsed} Stunde{booking.hoursUsed !== 1 ? 'n' : ''}
                    </div>
                  )}
                  {booking.comment && (
                    <div className="booking-item-comment">{booking.comment}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="clock-out-buttons">
        <button type="button" onClick={handleSimpleClockOutClick} className="btn secondary-btn">
          Einfach Ausstempeln
        </button>
        <button 
          onClick={() => setShowVehicleModal(true)} 
          className="btn info-btn"
        >
          Fahrzeugzeit buchen
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

      {showVehicleModal && (
        <VehicleBookingModal
          timeEntry={timeEntry}
          onClose={() => {
            setShowVehicleModal(false)
            loadVehicleBookings()
          }}
        />
      )}

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

