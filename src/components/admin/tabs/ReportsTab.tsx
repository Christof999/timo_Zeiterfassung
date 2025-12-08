import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { Employee, TimeEntry, Project, Vehicle, VehicleUsage, FileUpload } from '../../../types'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'
import '../../../styles/ReportPrint.css'

type ReportType = 'employee' | 'project'

interface ReportEntry {
  id: string
  originalEntry: TimeEntry
  date: string
  dateRaw: Date | null
  projectId: string
  projectName: string
  clockIn: string
  clockOut: string
  pauseMinutes: number
  pauseMs: number
  workHours: string
  isEdited: boolean
}

interface EmployeeSummary {
  employeeId: string
  employeeName: string
  totalHours: number
  hourlyRate: number
  totalCost: number
}

interface VehicleSummary {
  vehicleId: string
  vehicleName: string
  totalHours: number
  hourlyRate: number
  totalCost: number
}

const ReportsTab: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('employee')
  
  // Gemeinsame States
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Mitarbeiter-Bericht States
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('')
  const [reportEntries, setReportEntries] = useState<ReportEntry[]>([])

  // Projekt-Bericht States
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [employeeSummaries, setEmployeeSummaries] = useState<EmployeeSummary[]>([])
  const [vehicleSummaries, setVehicleSummaries] = useState<VehicleSummary[]>([])
  const [projectPhotos, setProjectPhotos] = useState<FileUpload[]>([])
  const [projectDocuments, setProjectDocuments] = useState<FileUpload[]>([])
  const [lightboxImage, setLightboxImage] = useState<FileUpload | null>(null)
  const [useTimeFilter, setUseTimeFilter] = useState(false)

  useEffect(() => {
    loadInitialData()
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setStartDate(firstDay.toISOString().split('T')[0])
    setEndDate(lastDay.toISOString().split('T')[0])
  }, [])

  // Reset wenn Berichtstyp wechselt
  useEffect(() => {
    setHasSearched(false)
    setReportEntries([])
    setEmployeeSummaries([])
    setVehicleSummaries([])
    setProjectPhotos([])
    setProjectDocuments([])
  }, [reportType])

  const loadInitialData = async () => {
    try {
      const [fetchedEmployees, fetchedProjects, fetchedVehicles] = await Promise.all([
        DataService.getAllEmployees(),
        DataService.getAllProjects(),
        DataService.getAllVehicles()
      ])
      
      setAllEmployees(fetchedEmployees)
      
      const filteredEmployees = fetchedEmployees.filter(e => {
        if (e.status === 'inactive') return false
        if (e.isAdmin) return false
        const name = (e.name || `${e.firstName} ${e.lastName}`).toLowerCase()
        if (name.includes('administrator') || name.includes('admin')) return false
        return true
      })
      setEmployees(filteredEmployees)
      setProjects(fetchedProjects)
      setVehicles(fetchedVehicles)
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Daten')
    }
  }

  const convertToDate = (date: any): Date | null => {
    if (!date) return null
    if (date?.toDate) return date.toDate()
    if (date?.seconds) return new Date(date.seconds * 1000)
    if (date instanceof Date) return date
    const d = new Date(date)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDateForDisplay = (date: Date): string => {
    return date.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatTimeForInput = (date: Date | null): string => {
    if (!date) return ''
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const getProjectName = (projectId: string): string => {
    const project = projects.find(p => p.id === projectId)
    return project?.name || projectId
  }

  const calculateWorkHours = (clockIn: string, clockOut: string, pauseMinutes: number): string => {
    if (!clockIn || !clockOut) return '-'
    const [inH, inM] = clockIn.split(':').map(Number)
    const [outH, outM] = clockOut.split(':').map(Number)
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return '-'
    let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM) - pauseMinutes
    if (totalMinutes < 0) totalMinutes += 24 * 60
    const hours = Math.floor(totalMinutes / 60)
    const minutes = Math.abs(totalMinutes % 60)
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  const msToMinutes = (ms: number): number => Math.round(ms / (1000 * 60))

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  // ==================== MITARBEITER-BERICHT ====================
  const handleEmployeeSearch = async () => {
    if (!selectedEmployeeId) {
      toast.error('Bitte wählen Sie einen Mitarbeiter aus')
      return
    }
    if (!startDate || !endDate) {
      toast.error('Bitte wählen Sie einen Zeitraum aus')
      return
    }

    setIsLoading(true)
    setHasSearched(true)

    try {
      const allEntries = await DataService.getTimeEntriesByEmployeeId(selectedEmployeeId)
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const filteredEntries = allEntries.filter(entry => {
        const entryDate = convertToDate(entry.clockInTime)
        if (!entryDate) return false
        return entryDate >= start && entryDate <= end
      })

      filteredEntries.sort((a, b) => {
        const dateA = convertToDate(a.clockInTime)
        const dateB = convertToDate(b.clockInTime)
        if (!dateA || !dateB) return 0
        return dateA.getTime() - dateB.getTime()
      })

      const entries: ReportEntry[] = filteredEntries.map(entry => {
        const clockInDate = convertToDate(entry.clockInTime)
        const clockOutDate = convertToDate(entry.clockOutTime)
        const clockIn = formatTimeForInput(clockInDate)
        const clockOut = formatTimeForInput(clockOutDate)
        const pauseMs = entry.pauseTotalTime || 0
        const pauseMinutes = msToMinutes(pauseMs)

        return {
          id: entry.id,
          originalEntry: entry,
          date: clockInDate ? formatDateForDisplay(clockInDate) : '-',
          dateRaw: clockInDate,
          projectId: entry.projectId,
          projectName: getProjectName(entry.projectId),
          clockIn,
          clockOut,
          pauseMinutes,
          pauseMs,
          workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes),
          isEdited: false
        }
      })

      setReportEntries(entries)
      const emp = employees.find(e => e.id === selectedEmployeeId)
      setSelectedEmployeeName(emp?.name || `${emp?.firstName} ${emp?.lastName}` || '')
    } catch (error) {
      console.error('Fehler:', error)
      toast.error('Fehler beim Laden der Zeiteinträge')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldChange = (index: number, field: keyof ReportEntry, value: string | number) => {
    setReportEntries(prev => {
      const updated = [...prev]
      const entry = { ...updated[index] }
      if (field === 'clockIn') entry.clockIn = value as string
      else if (field === 'clockOut') entry.clockOut = value as string
      else if (field === 'pauseMinutes') entry.pauseMinutes = Number(value) || 0
      else if (field === 'projectName') entry.projectName = value as string
      entry.workHours = calculateWorkHours(entry.clockIn, entry.clockOut, entry.pauseMinutes)
      entry.isEdited = true
      updated[index] = entry
      return updated
    })
  }

  const handleResetEntry = (index: number) => {
    setReportEntries(prev => {
      const updated = [...prev]
      const original = prev[index].originalEntry
      const clockInDate = convertToDate(original.clockInTime)
      const clockOutDate = convertToDate(original.clockOutTime)
      const clockIn = formatTimeForInput(clockInDate)
      const clockOut = formatTimeForInput(clockOutDate)
      const pauseMs = original.pauseTotalTime || 0
      const pauseMinutes = msToMinutes(pauseMs)
      updated[index] = {
        ...updated[index],
        projectName: getProjectName(original.projectId),
        clockIn, clockOut, pauseMinutes, pauseMs,
        workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes),
        isEdited: false
      }
      return updated
    })
  }

  const calculateTotalHours = (): string => {
    let totalMinutes = 0
    reportEntries.forEach(entry => {
      if (entry.workHours && entry.workHours !== '-') {
        const [h, m] = entry.workHours.split(':').map(Number)
        totalMinutes += h * 60 + m
      }
    })
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  // ==================== PROJEKT-BERICHT ====================
  const handleProjectSearch = async () => {
    if (!selectedProjectId) {
      toast.error('Bitte wählen Sie ein Projekt aus')
      return
    }

    setIsLoading(true)
    setHasSearched(true)

    try {
      const project = projects.find(p => p.id === selectedProjectId)
      setSelectedProject(project || null)

      // Zeiteinträge laden
      let timeEntries = await DataService.getTimeEntriesByProject(selectedProjectId)
      
      // Optional nach Zeitraum filtern
      if (useTimeFilter && startDate && endDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        
        timeEntries = timeEntries.filter(entry => {
          const entryDate = convertToDate(entry.clockInTime)
          if (!entryDate) return false
          return entryDate >= start && entryDate <= end
        })
      }

      // Nach Mitarbeiter gruppieren und summieren
      const employeeMap = new Map<string, { hours: number; rate: number; name: string }>()
      
      timeEntries.forEach(entry => {
        if (!entry.clockOutTime) return // Nur abgeschlossene Einträge
        
        const clockIn = convertToDate(entry.clockInTime)
        const clockOut = convertToDate(entry.clockOutTime)
        if (!clockIn || !clockOut) return
        
        const diffMs = clockOut.getTime() - clockIn.getTime()
        const pauseMs = entry.pauseTotalTime || 0
        const workMs = diffMs - pauseMs
        const hours = workMs / (1000 * 60 * 60)
        
        const employee = allEmployees.find(e => e.id === entry.employeeId)
        const hourlyRate = employee?.hourlyWage || employee?.hourlyRate || 0
        const employeeName = employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || entry.employeeId
        
        const existing = employeeMap.get(entry.employeeId)
        if (existing) {
          existing.hours += hours
        } else {
          employeeMap.set(entry.employeeId, { hours, rate: hourlyRate, name: employeeName })
        }
      })

      const empSummaries: EmployeeSummary[] = Array.from(employeeMap.entries()).map(([id, data]) => ({
        employeeId: id,
        employeeName: data.name,
        totalHours: Math.round(data.hours * 100) / 100,
        hourlyRate: data.rate,
        totalCost: Math.round(data.hours * data.rate * 100) / 100
      }))
      empSummaries.sort((a, b) => b.totalCost - a.totalCost)
      setEmployeeSummaries(empSummaries)

      // Fahrzeugbuchungen laden
      let vehicleUsages: VehicleUsage[] = []
      try {
        vehicleUsages = await DataService.getVehicleUsagesByProject(selectedProjectId)
        
        // Optional nach Zeitraum filtern
        if (useTimeFilter && startDate && endDate) {
          const start = new Date(startDate)
          start.setHours(0, 0, 0, 0)
          const end = new Date(endDate)
          end.setHours(23, 59, 59, 999)
          
          vehicleUsages = vehicleUsages.filter(usage => {
            const usageDate = convertToDate(usage.date)
            if (!usageDate) return false
            return usageDate >= start && usageDate <= end
          })
        }
      } catch (e) {
        console.log('Keine Fahrzeugbuchungen gefunden')
      }

      // Nach Fahrzeug gruppieren
      const vehicleMap = new Map<string, { hours: number; rate: number; name: string }>()
      
      vehicleUsages.forEach(usage => {
        const hours = usage.hours || usage.hoursUsed || 0
        const vehicle = vehicles.find(v => v.id === usage.vehicleId)
        const hourlyRate = vehicle?.hourlyRate || 0
        const vehicleName = vehicle?.name || usage.vehicleId
        
        const existing = vehicleMap.get(usage.vehicleId)
        if (existing) {
          existing.hours += hours
        } else {
          vehicleMap.set(usage.vehicleId, { hours, rate: hourlyRate, name: vehicleName })
        }
      })

      const vehSummaries: VehicleSummary[] = Array.from(vehicleMap.entries()).map(([id, data]) => ({
        vehicleId: id,
        vehicleName: data.name,
        totalHours: Math.round(data.hours * 100) / 100,
        hourlyRate: data.rate,
        totalCost: Math.round(data.hours * data.rate * 100) / 100
      }))
      vehSummaries.sort((a, b) => b.totalCost - a.totalCost)
      setVehicleSummaries(vehSummaries)

      // Fotos und Dokumente laden
      try {
        const [photos, docs] = await Promise.all([
          DataService.getProjectFiles(selectedProjectId, 'photo'),
          DataService.getProjectFiles(selectedProjectId, 'document')
        ])
        
        // Nach Datum sortieren
        const sortByDate = (a: FileUpload, b: FileUpload) => {
          const dateA = convertToDate(a.uploadTime)
          const dateB = convertToDate(b.uploadTime)
          if (!dateA || !dateB) return 0
          return dateB.getTime() - dateA.getTime()
        }
        
        setProjectPhotos(photos.sort(sortByDate))
        setProjectDocuments(docs.sort(sortByDate))
      } catch (e) {
        console.log('Fehler beim Laden der Dateien:', e)
      }

    } catch (error) {
      console.error('Fehler:', error)
      toast.error('Fehler beim Laden der Projektdaten')
    } finally {
      setIsLoading(false)
    }
  }

  const getEmployeeTotalCost = () => employeeSummaries.reduce((sum, e) => sum + e.totalCost, 0)
  const getVehicleTotalCost = () => vehicleSummaries.reduce((sum, v) => sum + v.totalCost, 0)
  const getProjectTotalCost = () => getEmployeeTotalCost() + getVehicleTotalCost()

  const getImageSrc = (file: FileUpload): string => {
    if (file.base64Data) {
      if (file.base64Data.startsWith('data:')) return file.base64Data
      const mime = file.mimeType || 'image/jpeg'
      return `data:${mime};base64,${file.base64Data}`
    }
    if ((file as any).fileUrl) return (file as any).fileUrl
    if ((file as any).url) return (file as any).url
    return ''
  }

  const handlePrint = () => window.print()

  const formatPeriod = (): string => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    return `${start.toLocaleDateString('de-DE')} - ${end.toLocaleDateString('de-DE')}`
  }

  const hasEdits = reportEntries.some(e => e.isEdited)

  return (
    <div className="reports-tab">
      {/* Tab-Auswahl */}
      <div className="report-type-tabs no-print">
        <button
          className={`report-type-btn ${reportType === 'employee' ? 'active' : ''}`}
          onClick={() => setReportType('employee')}
        >
          👤 Mitarbeiter-Zeitauswertung
        </button>
        <button
          className={`report-type-btn ${reportType === 'project' ? 'active' : ''}`}
          onClick={() => setReportType('project')}
        >
          📁 Projekt-Nachkalkulation
        </button>
      </div>

      {/* ==================== MITARBEITER-BERICHT ==================== */}
      {reportType === 'employee' && (
        <>
          <div className="report-filters no-print">
            <h3>Zeitauswertung erstellen</h3>
            <div className="filter-row">
              <div className="filter-group">
                <label>Mitarbeiter:</label>
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                  <option value="">-- Bitte wählen --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || `${emp.firstName} ${emp.lastName}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="filter-row">
              <div className="filter-group">
                <label>Von:</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="filter-group">
                <label>Bis:</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <button onClick={handleEmployeeSearch} className="btn primary-btn search-btn" disabled={isLoading}>
              {isLoading ? 'Lädt...' : '🔍 Auswertung laden'}
            </button>
          </div>

          {hasSearched && (
            <div className="report-content">
              <div className="print-header print-only">
                <h2>Arbeitszeitnachweis</h2>
                <div className="print-meta">
                  <p><strong>Mitarbeiter:</strong> {selectedEmployeeName}</p>
                  <p><strong>Zeitraum:</strong> {formatPeriod()}</p>
                  <p><strong>Erstellt am:</strong> {new Date().toLocaleDateString('de-DE')}</p>
                </div>
              </div>

              <div className="report-actions no-print">
                <div className="actions-left">
                  <h4>Bericht für {selectedEmployeeName} <span className="date-range">({formatPeriod()})</span></h4>
                  {hasEdits && <span className="edit-hint">⚠️ Es gibt temporäre Änderungen (nur für Druck)</span>}
                </div>
                <div className="actions-right">
                  {hasEdits && <button onClick={handleEmployeeSearch} className="btn secondary-btn">↩️ Zurücksetzen</button>}
                  <button onClick={handlePrint} className="btn primary-btn">🖨️ Drucken</button>
                </div>
              </div>

              <div className="edit-notice no-print">
                <p>💡 <strong>Tipp:</strong> Änderungen sind nur temporär für den Druck.</p>
              </div>

              {reportEntries.length === 0 ? (
                <p className="no-data">Keine Zeiteinträge gefunden</p>
              ) : (
                <div className="report-table-container">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Projekt</th>
                        <th>Kommen</th>
                        <th>Gehen</th>
                        <th>Pause</th>
                        <th>Arbeitszeit</th>
                        <th className="no-print">Akt.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportEntries.map((entry, index) => (
                        <tr key={entry.id} className={entry.isEdited ? 'edited-row' : ''}>
                          <td className="date-cell">{entry.date}</td>
                          <td><input type="text" value={entry.projectName} onChange={(e) => handleFieldChange(index, 'projectName', e.target.value)} className="inline-edit" /></td>
                          <td><input type="time" value={entry.clockIn} onChange={(e) => handleFieldChange(index, 'clockIn', e.target.value)} className="inline-edit time-input" /></td>
                          <td><input type="time" value={entry.clockOut} onChange={(e) => handleFieldChange(index, 'clockOut', e.target.value)} className="inline-edit time-input" /></td>
                          <td><input type="number" min="0" value={entry.pauseMinutes} onChange={(e) => handleFieldChange(index, 'pauseMinutes', e.target.value)} className="inline-edit pause-input" /></td>
                          <td className="hours-cell">{entry.workHours}</td>
                          <td className="no-print actions-cell">{entry.isEdited && <button onClick={() => handleResetEntry(index)} className="reset-btn">↩️</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td colSpan={5}><strong>Gesamt:</strong></td>
                        <td className="hours-cell"><strong>{calculateTotalHours()}</strong></td>
                        <td className="no-print"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="print-footer print-only">
                <div className="signature-line">
                  <div className="signature-box"><p>Unterschrift Mitarbeiter</p><div className="line"></div></div>
                  <div className="signature-box"><p>Unterschrift Arbeitgeber</p><div className="line"></div></div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== PROJEKT-BERICHT ==================== */}
      {reportType === 'project' && (
        <>
          <div className="report-filters no-print">
            <h3>Projekt-Nachkalkulation</h3>
            <div className="filter-row">
              <div className="filter-group">
                <label>Projekt:</label>
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                  <option value="">-- Bitte wählen --</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="filter-row checkbox-row">
              <label className="checkbox-label">
                <input type="checkbox" checked={useTimeFilter} onChange={(e) => setUseTimeFilter(e.target.checked)} />
                <span>Zeitraum filtern (optional)</span>
              </label>
            </div>
            
            {useTimeFilter && (
              <div className="filter-row">
                <div className="filter-group">
                  <label>Von:</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="filter-group">
                  <label>Bis:</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

            <button onClick={handleProjectSearch} className="btn primary-btn search-btn" disabled={isLoading}>
              {isLoading ? 'Lädt...' : '🔍 Kalkulation erstellen'}
            </button>
          </div>

          {hasSearched && selectedProject && (
            <div className="report-content project-report">
              {/* Druck-Header */}
              <div className="print-header print-only">
                <h2>Projekt-Nachkalkulation</h2>
              </div>

              {/* Aktionsleiste */}
              <div className="report-actions no-print">
                <div className="actions-left">
                  <h4>Kalkulation: {selectedProject.name}</h4>
                </div>
                <div className="actions-right">
                  <button onClick={handlePrint} className="btn primary-btn">🖨️ Drucken</button>
                </div>
              </div>

              {/* Projektinfo */}
              <div className="project-info-section">
                <h4>📋 Projektinformationen</h4>
                <div className="project-info-grid">
                  <div className="info-item">
                    <span className="info-label">Projekt:</span>
                    <span className="info-value">{selectedProject.name}</span>
                  </div>
                  {selectedProject.client && (
                    <div className="info-item">
                      <span className="info-label">Kunde:</span>
                      <span className="info-value">{selectedProject.client}</span>
                    </div>
                  )}
                  {(selectedProject.address || selectedProject.location) && (
                    <div className="info-item">
                      <span className="info-label">Adresse:</span>
                      <span className="info-value">{selectedProject.address || selectedProject.location}</span>
                    </div>
                  )}
                  {useTimeFilter && (
                    <div className="info-item">
                      <span className="info-label">Zeitraum:</span>
                      <span className="info-value">{formatPeriod()}</span>
                    </div>
                  )}
                </div>
                {selectedProject.description && (
                  <div className="project-description">
                    <span className="info-label">Beschreibung:</span>
                    <p>{selectedProject.description}</p>
                  </div>
                )}
              </div>

              {/* Personalkosten */}
              <div className="cost-section">
                <h4>👥 Personalkosten</h4>
                {employeeSummaries.length === 0 ? (
                  <p className="no-data">Keine Zeiteinträge vorhanden</p>
                ) : (
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Mitarbeiter</th>
                        <th className="number-cell">Stunden</th>
                        <th className="number-cell">Stundensatz</th>
                        <th className="number-cell">Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeSummaries.map(emp => (
                        <tr key={emp.employeeId}>
                          <td>{emp.employeeName}</td>
                          <td className="number-cell">{emp.totalHours.toFixed(2)} h</td>
                          <td className="number-cell">{formatCurrency(emp.hourlyRate)}</td>
                          <td className="number-cell">{formatCurrency(emp.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="subtotal-row">
                        <td colSpan={3}><strong>Summe Personalkosten:</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getEmployeeTotalCost())}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Fahrzeugkosten */}
              <div className="cost-section">
                <h4>🚗 Fahrzeugkosten</h4>
                {vehicleSummaries.length === 0 ? (
                  <p className="no-data">Keine Fahrzeugbuchungen vorhanden</p>
                ) : (
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Fahrzeug</th>
                        <th className="number-cell">Stunden</th>
                        <th className="number-cell">Stundensatz</th>
                        <th className="number-cell">Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicleSummaries.map(veh => (
                        <tr key={veh.vehicleId}>
                          <td>{veh.vehicleName}</td>
                          <td className="number-cell">{veh.totalHours.toFixed(2)} h</td>
                          <td className="number-cell">{formatCurrency(veh.hourlyRate)}</td>
                          <td className="number-cell">{formatCurrency(veh.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="subtotal-row">
                        <td colSpan={3}><strong>Summe Fahrzeugkosten:</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getVehicleTotalCost())}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Gesamtsumme */}
              <div className="total-cost-section">
                <div className="total-cost-box">
                  <span className="total-label">Gesamtkosten Projekt:</span>
                  <span className="total-value">{formatCurrency(getProjectTotalCost())}</span>
                </div>
              </div>

              {/* Baustellenfotos */}
              {projectPhotos.length > 0 && (
                <div className="media-section">
                  <h4>📷 Baustellenfotos ({projectPhotos.length})</h4>
                  <div className="photo-grid">
                    {projectPhotos.map((photo, idx) => {
                      const imgSrc = getImageSrc(photo)
                      const uploadDate = convertToDate(photo.uploadTime)
                      return (
                        <div key={photo.id || idx} className="photo-card" onClick={() => setLightboxImage(photo)}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={photo.fileName || 'Foto'} className="photo-thumbnail" />
                          ) : (
                            <div className="photo-placeholder">📷</div>
                          )}
                          <div className="photo-info">
                            {uploadDate && <span className="photo-date">{uploadDate.toLocaleDateString('de-DE')}</span>}
                            {(photo.notes || photo.imageComment) && (
                              <span className="photo-desc">{photo.notes || photo.imageComment}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Dokumente */}
              {projectDocuments.length > 0 && (
                <div className="media-section">
                  <h4>📄 Dokumente ({projectDocuments.length})</h4>
                  <div className="document-list">
                    {projectDocuments.map((doc, idx) => {
                      const imgSrc = getImageSrc(doc)
                      const uploadDate = convertToDate(doc.uploadTime)
                      return (
                        <div key={doc.id || idx} className="document-card" onClick={() => setLightboxImage(doc)}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={doc.fileName || 'Dokument'} className="document-thumbnail" />
                          ) : (
                            <div className="document-placeholder">📄</div>
                          )}
                          <div className="document-info">
                            <span className="document-name">{doc.fileName || 'Dokument'}</span>
                            {uploadDate && <span className="document-date">{uploadDate.toLocaleDateString('de-DE')}</span>}
                            {(doc.notes || doc.imageComment) && (
                              <span className="document-desc">{doc.notes || doc.imageComment}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Druck-Footer */}
              <div className="print-footer print-only">
                <p>Erstellt am: {new Date().toLocaleDateString('de-DE')} um {new Date().toLocaleTimeString('de-DE')}</p>
              </div>
            </div>
          )}

          {/* Lightbox */}
          {lightboxImage && (
            <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
              <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                <button className="lightbox-close" onClick={() => setLightboxImage(null)}>×</button>
                <img src={getImageSrc(lightboxImage)} alt={lightboxImage.fileName || ''} className="lightbox-image" />
                {(lightboxImage.notes || lightboxImage.imageComment || lightboxImage.fileName) && (
                  <div className="lightbox-info">
                    {lightboxImage.fileName && <p className="lightbox-filename">{lightboxImage.fileName}</p>}
                    {(lightboxImage.notes || lightboxImage.imageComment) && (
                      <p className="lightbox-description">{lightboxImage.notes || lightboxImage.imageComment}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ReportsTab
