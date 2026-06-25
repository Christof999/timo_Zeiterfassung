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
  const [search, setSearch] = useState('')
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

  const term = search.trim().toLowerCase()
  const filteredProjects = term
    ? projects.filter((p) => (p.name || '').toLowerCase().includes(term))
    : projects
  const filteredCustomers = term
    ? customers.filter((c) => (c.name || '').toLowerCase().includes(term))
    : customers

  const switchMode = (next: ClockInMode) => {
    setMode(next)
    setSearch('')
  }

  return (
    <div className="clock-in-form">
      <div className="clock-in-mode-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'project'}
          className={`btn ${mode === 'project' ? 'primary-btn' : 'secondary-btn'}`}
          onClick={() => switchMode('project')}
        >
          Projekt
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'customer'}
          className={`btn ${mode === 'customer' ? 'primary-btn' : 'secondary-btn'}`}
          onClick={() => switchMode('customer')}
        >
          Kunde (Kleinauftrag)
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'project' ? (
          <div className="form-group">
            <label htmlFor="project-select">Projekt auswählen:</label>
            <input
              type="text"
              className="clock-in-search"
              placeholder="🔍 Suchen (optional)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            <select
              id="project-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              required
            >
              <option value="" disabled>Bitte wählen</option>
              {filteredProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || `Projekt ${project.id}`}
                </option>
              ))}
            </select>
            {filteredProjects.length === 0 && (
              <p className="no-data">Kein Projekt gefunden für „{search.trim()}".</p>
            )}
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="customer-select">Kunde auswählen:</label>
            {customers.length === 0 ? (
              <p className="no-data">Keine Kunden vorhanden. Bitte im Admin-Bereich anlegen.</p>
            ) : (
              <>
                <input
                  type="text"
                  className="clock-in-search"
                  placeholder="🔍 Suchen (optional)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
                <select
                  id="customer-select"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  required
                >
                  <option value="" disabled>Bitte wählen</option>
                  {filteredCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                {filteredCustomers.length === 0 && (
                  <p className="no-data">Kein Kunde gefunden für „{search.trim()}".</p>
                )}
              </>
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
