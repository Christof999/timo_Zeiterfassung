import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, Project, TimeEntry } from '../types'
import ClockInForm from './ClockInForm'
import ClockOutForm from './ClockOutForm'
import RecentActivities from './RecentActivities'
import NavigationMenu from './NavigationMenu'
import { toast } from './ToastContainer'
import '../styles/TimeTracking.css'

const TimeTracking: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [currentTimeEntry, setCurrentTimeEntry] = useState<TimeEntry | null>(null)
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [clockInTime, setClockInTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState('00:00:00')
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const init = async () => {
      const user = await DataService.getCurrentUser()
      if (!user || !user.id) {
        navigate('/login')
        return
      }

      setCurrentUser(user)
      
      // Prüfe auf aktiven Zeiteintrag
      const timeEntry = await DataService.getCurrentTimeEntry(user.id)
      if (timeEntry) {
        setCurrentTimeEntry(timeEntry)
        const project = await DataService.getProjectById(timeEntry.projectId)
        setCurrentProject(project)
        
        // Berechne Einstempelzeit
        const clockIn = timeEntry.clockInTime instanceof Date
          ? timeEntry.clockInTime
          : timeEntry.clockInTime?.toDate?.() || new Date(timeEntry.clockInTime)
        setClockInTime(clockIn)
      }
      
      setIsLoading(false)
    }

    init()
  }, [navigate])

  // Timer für die Zeitanzeige
  useEffect(() => {
    if (!clockInTime) return

    const interval = setInterval(() => {
      const now = new Date()
      const diffMs = now.getTime() - clockInTime.getTime()
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000)
      
      const timeStr = `${diffHrs.toString().padStart(2, '0')}:${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`
      setElapsedTime(timeStr)
    }, 1000)

    return () => clearInterval(interval)
  }, [clockInTime])

  const handleClockIn = async (projectId: string) => {
    try {
      const location = await getCurrentLocation()
      const now = new Date()

      const timeEntry = await DataService.addTimeEntry({
        employeeId: currentUser!.id,
        projectId,
        clockInTime: now,
        clockInLocation: location,
        notes: ''
      })

      setCurrentTimeEntry(timeEntry)
      const project = await DataService.getProjectById(projectId)
      setCurrentProject(project)
      setClockInTime(now)
      
      toast.success('Sie wurden erfolgreich eingestempelt!')
    } catch (error: any) {
      toast.error('Fehler beim Einstempeln: ' + error.message)
    }
  }

  const handleSimpleClockOut = async () => {
    if (!currentTimeEntry) return

    try {
      const location = await getCurrentLocation()
      const result = await DataService.clockOutEmployee(
        currentTimeEntry.id,
        currentTimeEntry.notes || '',
        location
      )

      setCurrentTimeEntry(null)
      setCurrentProject(null)
      setClockInTime(null)
      setElapsedTime('00:00:00')

      if (result.automaticBreak) {
        toast.success(`Erfolgreich ausgestempelt! Automatische Pause hinzugefügt: ${result.automaticBreak.duration} Minuten (${result.automaticBreak.reason})`, 6000)
      } else {
        toast.success('Sie wurden erfolgreich ausgestempelt!')
      }
    } catch (error: any) {
      toast.error('Fehler beim Ausstempeln: ' + error.message)
    }
  }

  const handleLogout = () => {
    if (currentTimeEntry) {
      if (!confirm('Sie sind noch eingestempelt. Möchten Sie sich wirklich abmelden?')) {
        return
      }
    }

    DataService.clearCurrentUser()
    navigate('/login')
  }

  const getCurrentLocation = (): Promise<{ lat: number | null; lng: number | null }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
        },
        () => {
          resolve({ lat: null, lng: null })
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  if (isLoading) {
    return <div className="loading">Lade...</div>
  }

  if (!currentUser) {
    return null
  }

  return (
    <div className="time-tracking-container">
      <header className="time-tracking-header">
        <div className="logo">
          <img 
            src="https://anfragenmanager.s3.eu-central-1.amazonaws.com/Logo_Lauffer_RGB.png" 
            alt="Lauffer Logo" 
            className="logo-image"
          />
          <h1>Lauffer Zeiterfassung</h1>
          <p>Gartenbau • Erdbau • Natursteinhandel</p>
        </div>
      </header>

      <main className="time-tracking-main">
        <div className="user-info-section">
          <p>Angemeldet als: <strong>{currentUser.firstName} {currentUser.lastName}</strong></p>
          <NavigationMenu onLogout={handleLogout} />
        </div>

        <div className="time-status-section">
          <h2>Status: <span className={currentTimeEntry ? 'status-clocked-in' : 'status-clocked-out'}>
            {currentTimeEntry ? 'Eingestempelt' : 'Nicht eingestempelt'}
          </span></h2>
          <div className="clock">
            <span>{elapsedTime}</span>
          </div>
        </div>

        {!currentTimeEntry ? (
          <ClockInForm onClockIn={handleClockIn} />
        ) : (
          <ClockOutForm
            timeEntry={currentTimeEntry}
            project={currentProject}
            clockInTime={clockInTime}
            onSimpleClockOut={handleSimpleClockOut}
            onUpdate={() => {
              // Reload time entry
              DataService.getCurrentTimeEntry(currentUser.id).then(setCurrentTimeEntry)
            }}
          />
        )}

        <RecentActivities employeeId={currentUser.id} />
      </main>
    </div>
  )
}

export default TimeTracking

