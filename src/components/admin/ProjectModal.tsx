import { useState, useEffect } from 'react'
import { deleteField, type FieldValue } from 'firebase/firestore'
import { DataService } from '../../services/dataService'
import type { Project, Customer } from '../../types'
import { toast } from '../ToastContainer'
import { toDateInputValue } from '../../utils/dateUtils'
import { isOverheadProject } from '../../constants/overheadProjects'
import '../../styles/Modal.css'

interface ProjectModalProps {
  project: Project | null
  onClose: () => void
  onSave: () => void
}

const ProjectModal: React.FC<ProjectModalProps> = ({ project, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    description: '',
    address: '',
    customerId: '',
    status: 'active' as 'active' | 'planned' | 'completed' | 'archived',
    startDate: '',
    endDate: ''
  })
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    DataService.getActiveCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]))
  }, [])

  // Hilfsfunktion um Datum aus verschiedenen Formaten zu konvertieren
  const convertToDateString = (date: any): string => {
    return toDateInputValue(date)
  }

  useEffect(() => {
    if (project) {
      // Status normalisieren
      let normalizedStatus: 'active' | 'planned' | 'completed' | 'archived' = 'active'
      if (project.status === 'active' || project.status === 'aktiv') normalizedStatus = 'active'
      else if (project.status === 'planned') normalizedStatus = 'planned'
      else if (project.status === 'completed') normalizedStatus = 'completed'
      else if (project.status === 'archived' || project.status === 'inactive') normalizedStatus = 'archived'
      
      setFormData({
        name: project.name || '',
        client: project.client || '',
        description: project.description || '',
        address: (project as any).address || (project as any).location || '',
        customerId: project.customerId || '',
        status: normalizedStatus,
        startDate: convertToDateString(project.startDate),
        endDate: convertToDateString(project.endDate)
      })
    }
  }, [project])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      type ProjectWrite = Omit<Partial<Project>, 'customerId' | 'customerName'> & {
        address?: string
        customerId?: string | FieldValue
        customerName?: string | FieldValue
        startDate?: Date | FieldValue
        endDate?: Date | FieldValue
      }
      const selectedCustomer = customers.find((c) => c.id === formData.customerId)
      const projectData: ProjectWrite = {
        name: formData.name,
        client: formData.client,
        description: formData.description,
        address: formData.address,
        status: formData.status,
        isActive: formData.status === 'active'
      }
      if (formData.customerId && selectedCustomer) {
        projectData.customerId = formData.customerId
        projectData.customerName = selectedCustomer.name
      } else if (project?.id) {
        projectData.customerId = deleteField()
        projectData.customerName = deleteField()
      }
      if (formData.startDate) {
        projectData.startDate = new Date(formData.startDate)
      } else if (project?.id) {
        projectData.startDate = deleteField()
      }
      if (formData.endDate) {
        projectData.endDate = new Date(formData.endDate)
      } else if (project?.id) {
        projectData.endDate = deleteField()
      }

      if (project?.id) {
        await DataService.updateProject(project.id, projectData as Partial<Project> & Record<string, unknown>)
        toast.success('Projekt erfolgreich aktualisiert')
      } else {
        await DataService.createProject(projectData as Partial<Project>)
        toast.success('Projekt erfolgreich erstellt')
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
          <h2>{project ? 'Projekt bearbeiten' : 'Neues Projekt'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {project && isOverheadProject(project) && (
            <p className="form-hint">
              <strong>Gemeinkosten-Projekt.</strong> Zeiten auf dieses Projekt werden niemandem
              berechnet – sie gehen im Tagesbericht mit dem Lohnkostensatz des Mitarbeiters gegen
              den Ertrag. Bitte nicht umbenennen oder archivieren, sonst fehlt den Mitarbeitern
              das Ziel für diese Stunden.
            </p>
          )}
          <div className="form-group">
            <label>Projektname:</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Kunde (Freitext):</label>
            <input
              type="text"
              value={formData.client}
              onChange={(e) => setFormData({ ...formData, client: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Verknüpfter Kunde:</label>
            <select
              value={formData.customerId}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
            >
              <option value="">— Kein Kunde verknüpft —</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Beschreibung:</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
            />
          </div>
          <div className="form-group">
            <label>Adresse / Standort:</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="z.B. Musterstraße 123, 12345 Stadt"
            />
          </div>
          <div className="form-group">
            <label>Status:</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            >
              <option value="planned">Geplant</option>
              <option value="active">Aktiv</option>
              <option value="completed">Abgeschlossen</option>
              <option value="archived">Archiviert</option>
            </select>
          </div>
          <div className="form-group">
            <label>Startdatum:</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Enddatum:</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
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

export default ProjectModal

