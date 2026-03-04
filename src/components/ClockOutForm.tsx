import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Project, Employee, Vehicle, VehicleUsage } from '../types'
import VehicleBookingModal from './VehicleBookingModal'
import ExtendedClockOutModal from './ExtendedClockOutModal'
import LiveDocumentationModal from './LiveDocumentationModal'
import '../styles/ClockOutForm.css'

interface ClockOutFormProps {
  timeEntry: TimeEntry
  project: Project | null
  clockInTime: Date | null
  onSimpleClockOut: () => void
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

  const documentationUsers = ['mdorner', 'plauffer', 'csoergel']
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)

  useEffect(() => {
    DataService.getCurrentUser().then(setCurrentUser)
  }, [])

  const canUseDocumentation = currentUser && 
    (documentationUsers.includes(currentUser.username || '') || currentUser.username === 'martin')

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
        <button onClick={onSimpleClockOut} className="btn secondary-btn">
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
        {canUseDocumentation && (
          <button 
            onClick={() => setShowExtendedModal(true)} 
            className="btn primary-btn"
          >
            Mit Dokumentation Ausstempeln
          </button>
        )}
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

      {showExtendedModal && (
        <ExtendedClockOutModal
          timeEntry={timeEntry}
          onClose={() => {
            setShowExtendedModal(false)
            onUpdate()
          }}
          onClockOutSuccess={onExtendedClockOutSuccess}
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

