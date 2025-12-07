import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { Project } from '../../types'
import { toast } from '../ToastContainer'
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
    status: 'active' as 'active' | 'planned' | 'completed' | 'archived',
    startDate: '',
    endDate: ''
  })
  const [isLoading, setIsLoading] = useState(false)

  // Hilfsfunktion um Datum aus verschiedenen Formaten zu konvertieren
  const convertToDateString = (date: any): string => {
    if (!date) return ''
    try {
      // Firebase Timestamp
      if (date && typeof date.toDate === 'function') {
        return date.toDate().toISOString().split('T')[0]
      }
      // Sekunden (Unix timestamp)
      if (date && typeof date.seconds === 'number') {
        return new Date(date.seconds * 1000).toISOString().split('T')[0]
      }
      // Bereits ein Date-Objekt oder String
      const d = new Date(date)
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0]
      }
      return ''
    } catch {
      return ''
    }
  }

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        client: project.client || '',
        description: project.description || '',
        address: (project as any).address || (project as any).location || '',
        status: project.status || 'active',
        startDate: convertToDateString(project.startDate),
        endDate: convertToDateString(project.endDate)
      })
    }
  }, [project])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const projectData: Partial<Project> & { address?: string } = {
        name: formData.name,
        client: formData.client,
        description: formData.description,
        address: formData.address,
        status: formData.status,
        isActive: formData.status === 'active',
        startDate: formData.startDate ? new Date(formData.startDate) : undefined,
        endDate: formData.endDate ? new Date(formData.endDate) : undefined
      }

      if (project?.id) {
        await DataService.updateProject(project.id, projectData)
        toast.success('Projekt erfolgreich aktualisiert')
      } else {
        await DataService.createProject(projectData)
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
            <label>Kunde:</label>
            <input
              type="text"
              value={formData.client}
              onChange={(e) => setFormData({ ...formData, client: e.target.value })}
            />
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

