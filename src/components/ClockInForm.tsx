import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { Project } from '../types'
import '../styles/ClockInForm.css'

interface ClockInFormProps {
  onClockIn: (projectId: string) => void
}

const ClockInForm: React.FC<ClockInFormProps> = ({ onClockIn }) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const activeProjects = await DataService.getActiveProjects()
        setProjects(activeProjects)
      } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProjects()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedProjectId) {
      onClockIn(selectedProjectId)
    }
  }

  if (isLoading) {
    return <div className="loading">Projekte werden geladen...</div>
  }

  return (
    <div className="clock-in-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="project-select">Projekt auswählen:</label>
          <select
            id="project-select"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            required
          >
            <option value="" disabled>Bitte wählen</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name || `Projekt ${project.id}`}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn primary-btn">
          Einstempeln
        </button>
      </form>
    </div>
  )
}

export default ClockInForm

