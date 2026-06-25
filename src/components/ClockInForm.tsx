import React, { useState, useEffect, useMemo } from 'react'
import { DataService } from '../services/dataService'
import type { Project, Customer } from '../types'
import SearchableSelect, { type SearchableOption } from './SearchableSelect'
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

  const projectOptions: SearchableOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name || `Projekt ${p.id}` })),
    [projects]
  )
  const customerOptions: SearchableOption[] = useMemo(
    () => customers.map((c) => ({ value: c.id!, label: c.name || 'Unbenannter Kunde' })),
    [customers]
  )

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

  const canSubmit =
    mode === 'project' ? !!selectedProjectId : !!selectedCustomerId && customers.length > 0

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
            <SearchableSelect
              id="project-select"
              options={projectOptions}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              placeholder="Bitte wählen"
              searchPlaceholder="🔍 Projekt suchen…"
              emptyText="Kein Projekt gefunden"
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="customer-select">Kunde auswählen:</label>
            {customers.length === 0 ? (
              <p className="no-data">Keine Kunden vorhanden. Bitte im Admin-Bereich anlegen.</p>
            ) : (
              <SearchableSelect
                id="customer-select"
                options={customerOptions}
                value={selectedCustomerId}
                onChange={setSelectedCustomerId}
                placeholder="Bitte wählen"
                searchPlaceholder="🔍 Kunde suchen…"
                emptyText="Kein Kunde gefunden"
              />
            )}
          </div>
        )}
        <button type="submit" className="btn primary-btn" disabled={!canSubmit}>
          Einstempeln
        </button>
      </form>
    </div>
  )
}

export default ClockInForm
