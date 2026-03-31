import React from 'react'
import type { Vehicle } from '../types'

export interface VehicleBookingFormFieldsProps {
  vehicles: Vehicle[]
  selectedVehicleId: string
  hours: number
  comment: string
  onVehicleChange: (id: string) => void
  onHoursChange: (hours: number) => void
  onCommentChange: (comment: string) => void
  idPrefix: string
}

export const VehicleBookingFormFields: React.FC<VehicleBookingFormFieldsProps> = ({
  vehicles,
  selectedVehicleId,
  hours,
  comment,
  onVehicleChange,
  onHoursChange,
  onCommentChange,
  idPrefix
}) => {
  return (
    <>
      <div className="form-group">
        <label htmlFor={`${idPrefix}-vehicle-select`}>Fahrzeug auswählen:</label>
        <select
          id={`${idPrefix}-vehicle-select`}
          value={selectedVehicleId}
          onChange={(e) => onVehicleChange(e.target.value)}
        >
          <option value="">Bitte Fahrzeug wählen</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name} {vehicle.type ? `(${vehicle.type})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor={`${idPrefix}-hours`}>Betriebsstunden:</label>
        <input
          type="number"
          id={`${idPrefix}-hours`}
          min="0.25"
          max="24"
          step="0.25"
          value={hours}
          onChange={(e) => onHoursChange(parseFloat(e.target.value) || 0)}
        />
        <small>Bitte geben Sie die Betriebszeit in Stunden an (z.B. 1,5 für 1,5 Stunden)</small>
      </div>

      <div className="form-group">
        <label htmlFor={`${idPrefix}-comment`}>Kommentar (optional):</label>
        <textarea
          id={`${idPrefix}-comment`}
          rows={2}
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Optionaler Kommentar zur Fahrzeugnutzung"
        />
      </div>
    </>
  )
}
