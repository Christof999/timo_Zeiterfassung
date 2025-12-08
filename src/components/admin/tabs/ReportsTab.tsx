import { useState, useEffect, useRef } from 'react'
import { DataService } from '../../../services/dataService'
import type { Employee, TimeEntry, Project } from '../../../types'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'
import '../../../styles/ReportPrint.css'

interface ReportEntry {
  id: string
  originalEntry: TimeEntry
  date: string
  projectId: string
  projectName: string
  clockIn: string
  clockOut: string
  pauseMinutes: number
  workHours: string
  isEdited: boolean
}

const ReportsTab: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reportEntries, setReportEntries] = useState<ReportEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadInitialData()
    // Standard-Zeitraum: Aktueller Monat
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setStartDate(firstDay.toISOString().split('T')[0])
    setEndDate(lastDay.toISOString().split('T')[0])
  }, [])

  const loadInitialData = async () => {
    try {
      const [allEmployees, allProjects] = await Promise.all([
        DataService.getAllEmployees(),
        DataService.getAllProjects()
      ])
      setEmployees(allEmployees.filter(e => e.status !== 'inactive'))
      setProjects(allProjects)
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
    
    let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM) - pauseMinutes
    if (totalMinutes < 0) totalMinutes += 24 * 60 // Über Mitternacht
    
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  const handleSearch = async () => {
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
      
      // Nach Zeitraum filtern
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const filteredEntries = allEntries.filter(entry => {
        const entryDate = convertToDate(entry.clockInTime)
        if (!entryDate) return false
        return entryDate >= start && entryDate <= end
      })

      // Nach Datum sortieren (älteste zuerst für Bericht)
      filteredEntries.sort((a, b) => {
        const dateA = convertToDate(a.clockInTime)
        const dateB = convertToDate(b.clockInTime)
        if (!dateA || !dateB) return 0
        return dateA.getTime() - dateB.getTime()
      })

      // In ReportEntry Format umwandeln
      const entries: ReportEntry[] = filteredEntries.map(entry => {
        const clockInDate = convertToDate(entry.clockInTime)
        const clockOutDate = convertToDate(entry.clockOutTime)
        const clockIn = formatTimeForInput(clockInDate)
        const clockOut = formatTimeForInput(clockOutDate)
        const pauseMinutes = entry.pauseTotalTime || 0

        return {
          id: entry.id,
          originalEntry: entry,
          date: clockInDate ? formatDateForDisplay(clockInDate) : '-',
          projectId: entry.projectId,
          projectName: getProjectName(entry.projectId),
          clockIn,
          clockOut,
          pauseMinutes,
          workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes),
          isEdited: false
        }
      })

      setReportEntries(entries)
      
      // Mitarbeitername speichern
      const emp = employees.find(e => e.id === selectedEmployeeId)
      setSelectedEmployeeName(emp?.name || `${emp?.firstName} ${emp?.lastName}` || '')
      
    } catch (error) {
      console.error('Fehler beim Laden der Zeiteinträge:', error)
      toast.error('Fehler beim Laden der Zeiteinträge')
    } finally {
      setIsLoading(false)
    }
  }

  // Temporäre Änderung eines Feldes (nur für Druck)
  const handleFieldChange = (index: number, field: keyof ReportEntry, value: string | number) => {
    setReportEntries(prev => {
      const updated = [...prev]
      const entry = { ...updated[index] }
      
      if (field === 'clockIn') {
        entry.clockIn = value as string
      } else if (field === 'clockOut') {
        entry.clockOut = value as string
      } else if (field === 'pauseMinutes') {
        entry.pauseMinutes = Number(value) || 0
      } else if (field === 'projectName') {
        entry.projectName = value as string
      }
      
      // Arbeitszeit neu berechnen
      entry.workHours = calculateWorkHours(entry.clockIn, entry.clockOut, entry.pauseMinutes)
      entry.isEdited = true
      
      updated[index] = entry
      return updated
    })
  }

  // Änderungen für einen Eintrag zurücksetzen
  const handleResetEntry = (index: number) => {
    setReportEntries(prev => {
      const updated = [...prev]
      const original = prev[index].originalEntry
      const clockInDate = convertToDate(original.clockInTime)
      const clockOutDate = convertToDate(original.clockOutTime)
      const clockIn = formatTimeForInput(clockInDate)
      const clockOut = formatTimeForInput(clockOutDate)
      const pauseMinutes = original.pauseTotalTime || 0

      updated[index] = {
        ...updated[index],
        projectName: getProjectName(original.projectId),
        clockIn,
        clockOut,
        pauseMinutes,
        workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes),
        isEdited: false
      }
      return updated
    })
  }

  // Alle Änderungen zurücksetzen
  const handleResetAll = () => {
    handleSearch()
  }

  // Gesamtstunden berechnen
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

  // Druckfunktion
  const handlePrint = () => {
    window.print()
  }

  // Formatierung für Zeitraum
  const formatPeriod = (): string => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    return `${start.toLocaleDateString('de-DE')} - ${end.toLocaleDateString('de-DE')}`
  }

  const hasEdits = reportEntries.some(e => e.isEdited)

  return (
    <div className="reports-tab">
      {/* Filter-Bereich (nicht drucken) */}
      <div className="report-filters no-print">
        <h3>Zeitauswertung erstellen</h3>
        
        <div className="filter-row">
          <div className="filter-group">
            <label>Mitarbeiter:</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
            >
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
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>Bis:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <button 
          onClick={handleSearch} 
          className="btn primary-btn search-btn"
          disabled={isLoading}
        >
          {isLoading ? 'Lädt...' : '🔍 Auswertung laden'}
        </button>
      </div>

      {/* Druckbarer Bericht */}
      {hasSearched && (
        <div className="report-content" ref={printRef}>
          {/* Druck-Header */}
          <div className="print-header print-only">
            <h2>Arbeitszeitnachweis</h2>
            <div className="print-meta">
              <p><strong>Mitarbeiter:</strong> {selectedEmployeeName}</p>
              <p><strong>Zeitraum:</strong> {formatPeriod()}</p>
              <p><strong>Erstellt am:</strong> {new Date().toLocaleDateString('de-DE')}</p>
            </div>
          </div>

          {/* Aktionsleiste (nicht drucken) */}
          <div className="report-actions no-print">
            <div className="actions-left">
              <h4>
                Bericht für {selectedEmployeeName}
                <span className="date-range">({formatPeriod()})</span>
              </h4>
              {hasEdits && (
                <span className="edit-hint">
                  ⚠️ Es gibt temporäre Änderungen (nur für Druck)
                </span>
              )}
            </div>
            <div className="actions-right">
              {hasEdits && (
                <button onClick={handleResetAll} className="btn secondary-btn">
                  ↩️ Alle zurücksetzen
                </button>
              )}
              <button onClick={handlePrint} className="btn primary-btn">
                🖨️ Drucken
              </button>
            </div>
          </div>

          {/* Hinweis */}
          <div className="edit-notice no-print">
            <p>💡 <strong>Tipp:</strong> Änderungen in der Tabelle sind nur temporär für den Druck. Die Original-Daten bleiben unverändert.</p>
          </div>

          {/* Tabelle */}
          {reportEntries.length === 0 ? (
            <p className="no-data">Keine Zeiteinträge im gewählten Zeitraum gefunden</p>
          ) : (
            <div className="report-table-container">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Projekt</th>
                    <th>Kommen</th>
                    <th>Gehen</th>
                    <th>Pause (Min)</th>
                    <th>Arbeitszeit</th>
                    <th className="no-print">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {reportEntries.map((entry, index) => (
                    <tr key={entry.id} className={entry.isEdited ? 'edited-row' : ''}>
                      <td className="date-cell">{entry.date}</td>
                      <td>
                        <input
                          type="text"
                          value={entry.projectName}
                          onChange={(e) => handleFieldChange(index, 'projectName', e.target.value)}
                          className="inline-edit"
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={entry.clockIn}
                          onChange={(e) => handleFieldChange(index, 'clockIn', e.target.value)}
                          className="inline-edit time-input"
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={entry.clockOut}
                          onChange={(e) => handleFieldChange(index, 'clockOut', e.target.value)}
                          className="inline-edit time-input"
                          placeholder="--:--"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="480"
                          value={entry.pauseMinutes}
                          onChange={(e) => handleFieldChange(index, 'pauseMinutes', e.target.value)}
                          className="inline-edit pause-input"
                        />
                      </td>
                      <td className="hours-cell">{entry.workHours}</td>
                      <td className="no-print actions-cell">
                        {entry.isEdited && (
                          <button 
                            onClick={() => handleResetEntry(index)}
                            className="reset-btn"
                            title="Zurücksetzen"
                          >
                            ↩️
                          </button>
                        )}
                      </td>
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

          {/* Druck-Footer */}
          <div className="print-footer print-only">
            <div className="signature-line">
              <div className="signature-box">
                <p>Unterschrift Mitarbeiter</p>
                <div className="line"></div>
              </div>
              <div className="signature-box">
                <p>Unterschrift Arbeitgeber</p>
                <div className="line"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsTab
