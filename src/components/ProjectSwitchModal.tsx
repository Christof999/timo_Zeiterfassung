import React, { useEffect, useState } from 'react'
import { DataService } from '../services/dataService'
import type { Project } from '../types'
import SaveProgressOverlay from './SaveProgressOverlay'
import { toast } from './ToastContainer'
import '../styles/Modal.css'
import '../styles/ProjectSwitchModal.css'

interface ProjectSwitchModalProps {
  currentProjectId: string
  currentProjectName?: string
  onClose: () => void
  onSwitch: (newProjectId: string) => Promise<void>
}

const ProjectSwitchModal: React.FC<ProjectSwitchModalProps> = ({
  currentProjectId,
  currentProjectName,
  onClose,
  onSwitch
}) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isSwitching, setIsSwitching] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const active = await DataService.getActiveProjects()
        setProjects(active.filter((p) => p.id !== currentProjectId))
      } catch (error) {
        console.error('Projekte laden:', error)
        toast.error('Projekte konnten nicht geladen werden')
      } finally {
        setIsLoadingProjects(false)
      }
    }
    load()
  }, [currentProjectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProjectId) {
      toast.error('Bitte wählen Sie ein neues Projekt')
      return
    }
    setIsSwitching(true)
    try {
      await onSwitch(selectedProjectId)
      onClose()
    } catch {
      // Fehlertoast in TimeTracking
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div
      className="modal-overlay project-switch-overlay"
      onClick={isSwitching ? undefined : onClose}
    >
      <div className="modal-content project-switch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Projekt wechseln</h3>
          <button
            type="button"
            className="close-modal-btn"
            onClick={onClose}
            disabled={isSwitching}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="project-switch-intro">
            Sie werden auf dem aktuellen Projekt
            {currentProjectName ? (
              <>
                {' '}
                <strong>{currentProjectName}</strong>
              </>
            ) : null}{' '}
            ohne Pause ausgestempelt und direkt auf dem neuen Projekt eingestempelt. Pausen tragen Sie
            erst beim Ausstempeln am Tagesende ein.
          </p>

          {isLoadingProjects ? (
            <p className="project-switch-loading">Projekte werden geladen…</p>
          ) : projects.length === 0 ? (
            <p className="project-switch-empty">Keine weiteren aktiven Projekte verfügbar.</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="project-switch-select">Neues Projekt:</label>
                <select
                  id="project-switch-select"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  required
                  disabled={isSwitching}
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name || `Projekt ${project.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="project-switch-actions">
                <button type="submit" className="btn primary-btn" disabled={isSwitching}>
                  Projekt wechseln
                </button>
                <button
                  type="button"
                  className="btn secondary-btn"
                  onClick={onClose}
                  disabled={isSwitching}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <SaveProgressOverlay
        visible={isSwitching}
        title="Projektwechsel"
        message="Ausstempeln und auf neuem Projekt einstempeln…"
      />
    </div>
  )
}

export default ProjectSwitchModal
