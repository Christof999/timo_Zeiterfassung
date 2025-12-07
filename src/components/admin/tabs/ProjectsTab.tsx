import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { Project } from '../../../types'
import { toast } from '../../ToastContainer'
import ProjectModal from '../ProjectModal'
import ProjectDetailModal from '../ProjectDetailModal'
import '../../../styles/AdminTabs.css'

const ProjectsTab: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const allProjects = await DataService.getAllProjects()
      setProjects(allProjects)
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error)
      toast.error('Fehler beim Laden der Projekte')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingProject(null)
    setShowModal(true)
  }

  const handleEdit = (project: Project) => {
    setEditingProject(project)
    setShowModal(true)
  }

  const handleView = (project: Project) => {
    setSelectedProject(project)
    setShowDetailModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie dieses Projekt wirklich archivieren?')) {
      return
    }

    try {
      await DataService.deleteProject(id)
      toast.success('Projekt erfolgreich archiviert')
      loadProjects()
    } catch (error: any) {
      toast.error('Fehler beim Archivieren: ' + error.message)
    }
  }

  const handleSave = () => {
    setShowModal(false)
    setEditingProject(null)
    loadProjects()
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'planned':
        return <span className="status-badge planned">Geplant</span>
      case 'active':
        return <span className="status-badge active">Aktiv</span>
      case 'completed':
        return <span className="status-badge completed">Abgeschlossen</span>
      case 'archived':
        return <span className="status-badge archived">Archiviert</span>
      default:
        return <span className="status-badge active">Aktiv</span>
    }
  }

  if (isLoading) {
    return <div className="loading">Lade Projekte...</div>
  }

  return (
    <div className="projects-tab">
      <div className="tab-header">
        <h3>Projekte</h3>
        <button onClick={handleAdd} className="btn primary-btn">
          ➕ Projekt hinzufügen
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="no-data">Keine Projekte vorhanden</p>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kunde</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.client || '-'}</td>
                  <td>{getStatusBadge(project.status)}</td>
                  <td className="action-buttons">
                    <button 
                      onClick={() => handleView(project)} 
                      className="action-btn view-btn"
                      aria-label="Details anzeigen"
                    >
                      👁️
                    </button>
                    <button 
                      onClick={() => handleEdit(project)} 
                      className="action-btn edit-btn"
                      aria-label="Bearbeiten"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => handleDelete(project.id!)} 
                      className="action-btn delete-btn"
                      aria-label="Archivieren"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ProjectModal
          project={editingProject}
          onClose={() => {
            setShowModal(false)
            setEditingProject(null)
          }}
          onSave={handleSave}
        />
      )}

      {showDetailModal && selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedProject(null)
          }}
        />
      )}
    </div>
  )
}

export default ProjectsTab

