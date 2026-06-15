import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { Project, Customer } from '../types'
import '../styles/ClockInForm.css'

export interface ClockInTarget {
  projectId?: string
  customerId?: string
  customerName?: string
}

interface ClockInFormProps {
  onClockIn: (target: ClockInTarget) => void
}

type ClockInMode = 'project' | 'customer'

const ClockInForm: React.FC<ClockInFormProps> = ({ onClockIn }) => {
  const [mode, setMode] = useState<ClockInMode>('project')
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [activeProjects, activeCustomers] = await Promise.all([
          DataService.getActiveProjects(),
          DataService.getActiveCustomers().catch(() => [])
        ])
        setProjects(activeProjects)
        setCustomers(activeCustomers)
      } catch (error) {
        console.error('Fehler beim Laden der Einstempel-Daten:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'project') {
      if (selectedProjectId) {
        onClockIn({ projectId: selectedProjectId })
      }
    } else {
      const customer = customers.find((c) => c.id === selectedCustomerId)
      if (customer) {
        onClockIn({ customerId: customer.id, customerName: customer.name })
      }
    }
  }

  if (isLoading) {
    return <div className="loading">Projekte werden geladen...</div>
  }

  return (
    <div className="clock-in-form">
      <div className="clock-in-mode-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'project'}
          className={`btn ${mode === 'project' ? 'primary-btn' : 'secondary-btn'}`}
          onClick={() => setMode('project')}
        >
          Projekt
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'customer'}
          className={`btn ${mode === 'customer' ? 'primary-btn' : 'secondary-btn'}`}
          onClick={() => setMode('customer')}
        >
          Kunde (Kleinauftrag)
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'project' ? (
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
        ) : (
          <div className="form-group">
            <label htmlFor="customer-select">Kunde auswählen:</label>
            {customers.length === 0 ? (
              <p className="no-data">Keine Kunden vorhanden. Bitte im Admin-Bereich anlegen.</p>
            ) : (
              <select
                id="customer-select"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                required
              >
                <option value="" disabled>Bitte wählen</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <button
          type="submit"
          className="btn primary-btn"
          disabled={mode === 'customer' && customers.length === 0}
        >
          Einstempeln
        </button>
      </form>
    </div>
  )
}

export default ClockInForm
