import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Vehicle } from '../types'
import { toast } from './ToastContainer'
import { getTodayLocalDateString } from '../utils/dateUtils'
import { VehicleBookingFormFields } from './VehicleBookingFormFields'
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
      const today = getTodayLocalDateString()
      const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(selectedVehicleId))

      await DataService.addVehicleUsage({
        vehicleId: selectedVehicleId,
        vehicleName: selectedVehicle?.name,
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
            <VehicleBookingFormFields
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              hours={hours}
              comment={comment}
              onVehicleChange={setSelectedVehicleId}
              onHoursChange={setHours}
              onCommentChange={setComment}
              idPrefix="booking-vehicle"
            />

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
