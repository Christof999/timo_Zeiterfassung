import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { Employee } from '../../types'
import { toast } from '../ToastContainer'
import '../../styles/Modal.css'

interface EmployeeModalProps {
  employee: Employee | null
  onClose: () => void
  onSave: () => void
}

const EmployeeModal: React.FC<EmployeeModalProps> = ({ employee, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    name: '',
    username: '',
    password: '',
    position: '',
    status: 'active' as 'active' | 'inactive',
    hourlyRate: 0
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (employee) {
      // Wenn firstName/lastName vorhanden sind, verwende diese
      // Ansonsten versuche name zu splitten
      let firstName = employee.firstName || ''
      let lastName = employee.lastName || ''
      
      // Wenn firstName/lastName leer sind, aber name vorhanden ist, splitte name
      if ((!firstName || !lastName) && employee.name) {
        const nameParts = employee.name.trim().split(/\s+/)
        if (nameParts.length >= 2) {
          firstName = nameParts[0]
          lastName = nameParts.slice(1).join(' ') // Rest als Nachname (falls mehrere Wörter)
        } else if (nameParts.length === 1) {
          firstName = nameParts[0]
          lastName = ''
        }
      }
      
      setFormData({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: employee.name || '',
        username: employee.username || '',
        password: '',
        position: employee.position || '',
        status: (employee.status as 'active' | 'inactive') || 'active',
        hourlyRate: employee.hourlyRate || employee.hourlyWage || 0
      })
    } else {
      // Reset form when no employee (new employee)
      setFormData({
        firstName: '',
        lastName: '',
        name: '',
        username: '',
        password: '',
        position: '',
        status: 'active',
        hourlyRate: 0
      })
    }
  }, [employee])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const employeeData: Partial<Employee> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: formData.name || `${formData.firstName} ${formData.lastName}`,
        username: formData.username,
        position: formData.position,
        status: formData.status,
        hourlyRate: formData.hourlyRate
      }

      if (formData.password) {
        employeeData.password = formData.password
      }

      if (employee?.id) {
        await DataService.updateEmployee(employee.id, employeeData)
        toast.success('Mitarbeiter erfolgreich aktualisiert')
      } else {
        if (!formData.password) {
          toast.error('Bitte geben Sie ein Passwort ein')
          setIsLoading(false)
          return
        }
        await DataService.createEmployee(employeeData)
        toast.success('Mitarbeiter erfolgreich erstellt')
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
          <h2>{employee ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Vorname:</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Nachname:</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Benutzername:</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Passwort {employee ? '(leer lassen zum Beibehalten)' : ''}:</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!employee}
            />
          </div>
          <div className="form-group">
            <label>Position:</label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Stundenlohn:</label>
            <input
              type="number"
              step="0.01"
              value={formData.hourlyRate}
              onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-group">
            <label>Status:</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
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

export default EmployeeModal

