import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Vehicle } from '../types'
import { toast } from './ToastContainer'
import '../styles/Modal.css'

interface VehicleBookingModalProps {
  timeEntry: TimeEntry
  onClose: () => void
}

const VehicleBookingModal: React.FC<VehicleBookingModalProps> = ({ timeEntry, onClose }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [hours, setHours] = useState(1)
  const [comment, setComment] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const allVehicles = await DataService.getAllVehicles()
        setVehicles(allVehicles.filter(v => v.isActive !== false))
      } catch (error) {
        console.error('Fehler beim Laden der Fahrzeuge:', error)
      }
    }
    loadVehicles()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedVehicleId) {
      toast.error('Bitte wählen Sie ein Fahrzeug aus')
      return
    }

    setIsLoading(true)
    try {
      const currentUser = await DataService.getCurrentUser()
      const today = new Date().toISOString().split('T')[0]

      await DataService.addVehicleUsage({
        vehicleId: selectedVehicleId,
        employeeId: currentUser!.id,
        projectId: timeEntry.projectId,
        date: today,
        hours: hours,
        hoursUsed: hours,
        comment: comment.trim() || undefined
      })

      toast.success('Fahrzeugzeit erfolgreich gebucht!')
      onClose()
    } catch (error: any) {
      toast.error('Fehler beim Buchen der Fahrzeugzeit: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Fahrzeugzeit buchen</h2>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="booking-vehicle-select">Fahrzeug auswählen:</label>
              <select
                id="booking-vehicle-select"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                required
              >
                <option value="" disabled>Bitte Fahrzeug wählen</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} {vehicle.type ? `(${vehicle.type})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="booking-vehicle-hours">Betriebsstunden:</label>
              <input
                type="number"
                id="booking-vehicle-hours"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(parseFloat(e.target.value))}
                required
              />
              <small>Bitte geben Sie die Betriebszeit in Stunden an (z.B. 1,5 für 1,5 Stunden)</small>
            </div>

            <div className="form-group">
              <label htmlFor="vehicle-booking-comment">Kommentar (optional):</label>
              <textarea
                id="vehicle-booking-comment"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optionaler Kommentar zur Fahrzeugnutzung"
              />
            </div>

            <div className="form-group text-center">
              <button type="submit" className="btn primary-btn" disabled={isLoading}>
                {isLoading ? 'Speichere...' : 'Fahrzeugzeit speichern'}
              </button>
              <button type="button" className="btn secondary-btn" onClick={onClose}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default VehicleBookingModal

