import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { TimeEntry, Employee, Project } from '../../../types'
import '../../../styles/AdminTabs.css'

const OverviewTab: React.FC = () => {
  const [activeEmployeesCount, setActiveEmployeesCount] = useState(0)
  const [activeProjectsCount, setActiveProjectsCount] = useState(0)
  const [todayHours, setTodayHours] = useState('0.00')
  const [liveActivities, setLiveActivities] = useState<Array<{
    employee: Employee
    project: Project
    timeEntry: TimeEntry
  }>>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
    const interval = setInterval(loadDashboardData, 30000) // Alle 30 Sekunden aktualisieren
    return () => clearInterval(interval)
  }, [])

  // Separate useEffect für Live-Dauer-Updates (alle Minute)
  useEffect(() => {
    if (liveActivities.length === 0) return
    
    const durationInterval = setInterval(() => {
      // Aktualisiere nur die Live-Aktivitäten für die Dauer-Anzeige
      loadDashboardData()
    }, 60000) // Alle Minute aktualisieren für Live-Dauer
    
    return () => clearInterval(durationInterval)
  }, [liveActivities.length])

  const loadDashboardData = async () => {
    try {
      // Eingestempelte Mitarbeiter zählen
      const currentTimeEntries = await DataService.getCurrentTimeEntries()
      const uniqueClockedInEmployees = new Set(currentTimeEntries.map(entry => entry.employeeId))
      setActiveEmployeesCount(uniqueClockedInEmployees.size)

      // Aktive Projekte zählen
      const projects = await DataService.getAllProjects()
      const activeProjects = projects.filter(project => 
        project.status === 'active' || project.isActive === true
      )
      setActiveProjectsCount(activeProjects.length)

      // Heutige Arbeitsstunden berechnen
      const todaysEntries = await DataService.getTodaysTimeEntries()
      const totalHours = DataService.calculateTotalWorkHours(todaysEntries)
      setTodayHours(totalHours.toFixed(2))

      // Live-Aktivitäten laden
      await loadLiveActivity(currentTimeEntries)
      
      setIsLoading(false)
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error)
      setIsLoading(false)
    }
  }

  const loadLiveActivity = async (timeEntries: TimeEntry[]) => {
    try {
      const employees = await DataService.getAllEmployees()
      const projects = await DataService.getAllProjects()
      
      const activities = await Promise.all(
        timeEntries.slice(0, 10).map(async (entry) => {
          const employee = employees.find(e => e.id === entry.employeeId)
          const project = projects.find(p => p.id === entry.projectId)
          
          if (employee && project) {
            return { employee, project, timeEntry: entry }
          }
          return null
        })
      )

      setLiveActivities(activities.filter(a => a !== null) as any)
    } catch (error) {
      console.error('Fehler beim Laden der Live-Aktivitäten:', error)
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
              const now = new Date()
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
              
              return (
                <div key={activity.timeEntry.id} className="activity-item">
                  <div className="activity-employee">
                    <strong>{activity.employee.name || `${activity.employee.firstName} ${activity.employee.lastName}`}</strong>
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default OverviewTab

