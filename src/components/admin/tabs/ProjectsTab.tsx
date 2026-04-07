import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { Project } from '../../../types'
import { isProjectArchivedOrCompleted } from '../../../utils/projectArchive'
import { toast } from '../../ToastContainer'
import ProjectModal from '../ProjectModal'
import ProjectDetailModal from '../ProjectDetailModal'
import '../../../styles/AdminTabs.css'

export type ProjectsTabVariant = 'active' | 'archived'

interface ProjectsTabProps {
  variant?: ProjectsTabVariant
}

const ProjectsTab: React.FC<ProjectsTabProps> = ({ variant = 'active' }) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const loadProjects = async () => {
    setIsLoading(true)
    try {
      const allProjects = await DataService.getAllProjects()
      const filtered = allProjects.filter((p) =>
        variant === 'archived'
          ? isProjectArchivedOrCompleted(p)
          : !isProjectArchivedOrCompleted(p)
      )
      setProjects(filtered)
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error)
      toast.error('Fehler beim Laden der Projekte')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [variant])

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
    const normalized = String(status ?? '')
      .toLowerCase()
      .trim()
    switch (normalized) {
      case 'planned':
        return <span className="status-badge planned">Geplant</span>
      case 'active':
      case 'aktiv':
        return <span className="status-badge active">Aktiv</span>
      case 'completed':
        return <span className="status-badge completed">Abgeschlossen</span>
      case 'archived':
      case 'inactive':
        return <span className="status-badge archived">Archiviert</span>
      default:
        return <span className="status-badge active">Aktiv</span>
    }
  }

  if (isLoading) {
    return (
      <div className="loading">
        {variant === 'archived' ? 'Lade archivierte Projekte...' : 'Lade Projekte...'}
      </div>
    )
  }

  const title = variant === 'archived' ? 'Archivierte Projekte' : 'Projekte'
  const emptyMessage =
    variant === 'archived'
      ? 'Keine archivierten oder abgeschlossenen Projekte'
      : 'Keine Projekte vorhanden'

  return (
    <div className="projects-tab">
      <div className="tab-header">
        <h3>{title}</h3>
        {variant === 'active' && (
          <button onClick={handleAdd} className="btn primary-btn">
            Projekt hinzufügen
          </button>
        )}
      </div>

      {variant === 'archived' && (
        <p className="tab-hint projects-archive-hint">
          Hier erscheinen Projekte mit Status <strong>Abgeschlossen</strong> oder{' '}
          <strong>Archiviert</strong> sowie über &quot;Archivieren&quot; verschobene Einträge.
        </p>
      )}

      {projects.length === 0 ? (
        <p className="no-data">{emptyMessage}</p>
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
                      Details
                    </button>
                    <button 
                      onClick={() => handleEdit(project)} 
                      className="action-btn edit-btn"
                      aria-label="Bearbeiten"
                    >
                      Bearbeiten
                    </button>
                    {variant === 'active' && (
                      <button 
                        onClick={() => handleDelete(project.id!)} 
                        className="action-btn delete-btn"
                        aria-label="Archivieren"
                      >
                        Archivieren
                      </button>
                    )}
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

