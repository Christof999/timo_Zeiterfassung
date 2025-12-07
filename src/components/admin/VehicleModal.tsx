import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { Vehicle } from '../../types'
import { toast } from '../ToastContainer'
import '../../styles/Modal.css'

interface VehicleModalProps {
  vehicle: Vehicle | null
  onClose: () => void
  onSave: () => void
}

const VehicleModal: React.FC<VehicleModalProps> = ({ vehicle, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    licensePlate: '',
    hourlyRate: '',
    isActive: true
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (vehicle) {
      setFormData({
        name: vehicle.name || '',
        type: vehicle.type || '',
        licensePlate: vehicle.licensePlate || '',
        hourlyRate: vehicle.hourlyRate ? String(vehicle.hourlyRate) : '',
        isActive: vehicle.isActive !== false
      })
    }
  }, [vehicle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const vehicleData: Partial<Vehicle> = {
        name: formData.name,
        type: formData.type,
        licensePlate: formData.licensePlate,
        hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : undefined,
        isActive: formData.isActive
      }

      if (vehicle?.id) {
        await DataService.updateVehicle(vehicle.id, vehicleData)
        toast.success('Fahrzeug erfolgreich aktualisiert')
      } else {
        await DataService.createVehicle(vehicleData)
        toast.success('Fahrzeug erfolgreich erstellt')
      }

      onSave()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{vehicle ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Name:</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Typ:</label>
            <input
              type="text"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Kennzeichen:</label>
            <input
              type="text"
              value={formData.licensePlate}
              onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Stundenpreis (€):</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.hourlyRate}
              onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
              placeholder="z.B. 25.00"
            />
          </div>
          <div className="form-group">
            <label>Status:</label>
            <select
              value={formData.isActive ? 'active' : 'inactive'}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn secondary-btn">
              Abbrechen
            </button>
            <button type="submit" className="btn primary-btn" disabled={isLoading}>
              {isLoading ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default VehicleModal

