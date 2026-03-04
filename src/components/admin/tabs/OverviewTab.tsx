import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { TimeEntry, Employee, Project } from '../../../types'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'

const OverviewTab: React.FC = () => {
  const [activeEmployeesCount, setActiveEmployeesCount] = useState(0)
  const [activeProjectsCount, setActiveProjectsCount] = useState(0)
  const [todayHours, setTodayHours] = useState('0.00')
  const [nowTick, setNowTick] = useState(Date.now())
  const [liveActivities, setLiveActivities] = useState<Array<{
    employee: Employee
    project: Project
    timeEntry: TimeEntry
  }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [clockingOut, setClockingOut] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
    const interval = setInterval(loadDashboardData, 30000) // Alle 30 Sekunden aktualisieren
    return () => clearInterval(interval)
  }, [])

  // Aktualisiert nur die Daueranzeige in der UI, ohne neue Firestore-Reads.
  useEffect(() => {
    const durationInterval = setInterval(() => setNowTick(Date.now()), 60000)
    return () => clearInterval(durationInterval)
  }, [])

  const loadDashboardData = async () => {
    try {
      const [currentTimeEntries, projects, todaysEntries, employees] = await Promise.all([
        DataService.getCurrentTimeEntries(),
        DataService.getAllProjects(),
        DataService.getTodaysTimeEntries(),
        DataService.getAllEmployees()
      ])

      // Eingestempelte Mitarbeiter zählen
      const uniqueClockedInEmployees = new Set(currentTimeEntries.map(entry => entry.employeeId))
      setActiveEmployeesCount(uniqueClockedInEmployees.size)

      // Aktive Projekte zählen
      const activeProjects = projects.filter(project => 
        project.status === 'active' || project.isActive === true
      )
      setActiveProjectsCount(activeProjects.length)

      // Heutige Arbeitsstunden berechnen
      const totalHours = DataService.calculateTotalWorkHours(todaysEntries)
      setTodayHours(totalHours.toFixed(2))

      // Live-Aktivitäten laden
      loadLiveActivity(currentTimeEntries, employees, projects)
      
      setIsLoading(false)
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error)
      setIsLoading(false)
    }
  }

  const loadLiveActivity = (timeEntries: TimeEntry[], employees: Employee[], projects: Project[]) => {
    const activities = timeEntries
      .slice(0, 10)
      .map((entry) => {
        const employee = employees.find(e => e.id === entry.employeeId)
        const project = projects.find(p => p.id === entry.projectId)
        if (!employee || !project) return null
        return { employee, project, timeEntry: entry }
      })
      .filter((activity) => activity !== null) as Array<{
      employee: Employee
      project: Project
      timeEntry: TimeEntry
    }>

    setLiveActivities(activities)
  }

  // Mitarbeiter ausstempeln (Admin-Funktion)
  const handleClockOut = async (timeEntry: TimeEntry, employeeName: string) => {
    if (!confirm(`Möchten Sie ${employeeName} wirklich ausstempeln?`)) {
      return
    }

    setClockingOut(timeEntry.id)
    
    try {
      const now = new Date()
      
      // Arbeitszeit berechnen für automatische Pause
      const clockInTime = timeEntry.clockInTime?.toDate?.() || new Date(timeEntry.clockInTime)
      const workDurationMs = now.getTime() - clockInTime.getTime()
      const workDurationHours = workDurationMs / (1000 * 60 * 60)
      
      // Automatische Pause nach deutschem Arbeitszeitgesetz
      let pauseTotalTime = timeEntry.pauseTotalTime || 0
      if (workDurationHours > 9 && pauseTotalTime < 45 * 60 * 1000) {
        pauseTotalTime = 45 * 60 * 1000 // 45 Minuten
      } else if (workDurationHours > 6 && pauseTotalTime < 30 * 60 * 1000) {
        pauseTotalTime = 30 * 60 * 1000 // 30 Minuten
      }

      await DataService.updateTimeEntry(timeEntry.id, {
        clockOutTime: now,
        pauseTotalTime,
        notes: (timeEntry.notes || '') + (timeEntry.notes ? ' | ' : '') + 'Ausgestempelt durch Admin'
      })

      toast.success(`${employeeName} wurde ausgestempelt`)
      
      // Daten neu laden
      loadDashboardData()
    } catch (error: any) {
      console.error('Fehler beim Ausstempeln:', error)
      toast.error('Fehler beim Ausstempeln: ' + error.message)
    } finally {
      setClockingOut(null)
    }
  }

  if (isLoading) {
    return <div className="loading">Lade Dashboard...</div>
  }

  return (
    <div className="overview-tab">
      <h3>Übersicht</h3>
      
      <div className="dashboard-stats">
        <div className="stat-card">
          <h4>Eingestempelte Mitarbeiter</h4>
          <p className="stat-value">{activeEmployeesCount}</p>
        </div>
        
        <div className="stat-card">
          <h4>Aktive Projekte</h4>
          <p className="stat-value">{activeProjectsCount}</p>
        </div>
        
        <div className="stat-card">
          <h4>Heutige Arbeitsstunden</h4>
          <p className="stat-value">{todayHours}h</p>
        </div>
      </div>

      <div className="live-activity-section">
        <h4>Live-Aktivitäten</h4>
        {liveActivities.length === 0 ? (
          <p className="no-data">Keine aktiven Zeiteinträge</p>
        ) : (
          <div className="activity-list">
            {liveActivities.map((activity) => {
              const clockInTime = activity.timeEntry.clockInTime instanceof Date
                ? activity.timeEntry.clockInTime
                : activity.timeEntry.clockInTime?.toDate?.() || new Date(activity.timeEntry.clockInTime)
              
              // Berechne die Dauer seit Einstempeln
              const now = new Date(nowTick)
              const durationMs = now.getTime() - clockInTime.getTime()
              const durationHours = Math.floor(durationMs / (1000 * 60 * 60))
              const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
              const durationString = durationHours > 0 
                ? `${durationHours}h ${durationMinutes}min`
                : `${durationMinutes}min`
              
              // Formatiere das Datum
              const dateString = clockInTime.toLocaleDateString('de-DE', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric' 
              })
              const timeString = clockInTime.toLocaleTimeString('de-DE', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })
              
              const employeeName = activity.employee.name || `${activity.employee.firstName} ${activity.employee.lastName}`
              const isClockingOut = clockingOut === activity.timeEntry.id
              
              return (
                <div key={activity.timeEntry.id} className="activity-item">
                  <div className="activity-main">
                    <div className="activity-info">
                      <div className="activity-employee">
                        <strong>{employeeName}</strong>
                      </div>
                      <div className="activity-project">{activity.project.name}</div>
                      <div className="activity-details">
                        <div className="activity-date">
                          📅 {dateString} um {timeString}
                        </div>
                        <div className="activity-duration">
                          ⏱️ Eingestempelt seit: {durationString}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleClockOut(activity.timeEntry, employeeName)}
                      className="btn clock-out-btn"
                      disabled={isClockingOut}
                      title="Mitarbeiter ausstempeln"
                    >
                      {isClockingOut ? '...' : '⏹️'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default OverviewTab

