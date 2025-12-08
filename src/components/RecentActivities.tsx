import React, { useState, useEffect } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Project } from '../types'
import { Timestamp } from 'firebase/firestore'
import '../styles/RecentActivities.css'

interface RecentActivitiesProps {
  employeeId: string
}

const RecentActivities: React.FC<RecentActivitiesProps> = ({ employeeId }) => {
  const [activities, setActivities] = useState<TimeEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadActivities = async () => {
      try {
        // Lade Einträge und Projekte parallel
        const [entries, allProjects] = await Promise.all([
          DataService.getTimeEntriesByEmployeeId(employeeId),
          DataService.getAllProjects()
        ])
        
        setProjects(allProjects)
        
        // Sortiere nach Datum (neueste zuerst)
        entries.sort((a, b) => {
          const dateA = a.clockInTime instanceof Timestamp
            ? a.clockInTime.toDate()
            : a.clockInTime instanceof Date
            ? a.clockInTime
            : new Date(a.clockInTime)
          const dateB = b.clockInTime instanceof Timestamp
            ? b.clockInTime.toDate()
            : b.clockInTime instanceof Date
            ? b.clockInTime
            : new Date(b.clockInTime)
          return dateB.getTime() - dateA.getTime()
        })

        // Nur die letzten 5 anzeigen
        setActivities(entries.slice(0, 5))
      } catch (error) {
        console.error('Fehler beim Laden der Aktivitäten:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadActivities()
  }, [employeeId])

  const getProjectName = (projectId: string): string => {
    const project = projects.find(p => p.id === projectId)
    return project?.name || 'Unbekanntes Projekt'
  }

  const formatDate = (date: Date | Timestamp | any) => {
    const d = date instanceof Timestamp
      ? date.toDate()
      : date instanceof Date
      ? date
      : new Date(date)
    return d.toLocaleDateString('de-DE')
  }

  const formatTime = (date: Date | Timestamp | any) => {
    const d = date instanceof Timestamp
      ? date.toDate()
      : date instanceof Date
      ? date
      : new Date(date)
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  const calculateWorkHours = (entry: TimeEntry) => {
    const clockIn = entry.clockInTime instanceof Timestamp
      ? entry.clockInTime.toDate()
      : entry.clockInTime instanceof Date
      ? entry.clockInTime
      : new Date(entry.clockInTime)

    if (!entry.clockOutTime) return null

    const clockOut = entry.clockOutTime instanceof Timestamp
      ? entry.clockOutTime.toDate()
      : entry.clockOutTime instanceof Date
      ? entry.clockOutTime
      : new Date(entry.clockOutTime)

    const diffMs = clockOut.getTime() - clockIn.getTime()
    const pauseTotalTime = entry.pauseTotalTime || 0
    const actualWorkTime = diffMs - pauseTotalTime
    const hours = actualWorkTime / (1000 * 60 * 60)
    return hours.toFixed(2).replace('.', ',')
  }

  if (isLoading) {
    return <div className="loading">Lade Aktivitäten...</div>
  }

  return (
    <div className="recent-activities">
      <h3>Letzte Aktivitäten</h3>
      {activities.length === 0 ? (
        <p>Keine Aktivitäten vorhanden</p>
      ) : (
        <ul className="activities-list">
          {activities.map((entry) => {
            const projectName = entry.isVacationDay ? 'Urlaub' : getProjectName(entry.projectId)
            const workHours = calculateWorkHours(entry)

            return (
              <li key={entry.id} className="activity-item">
                <strong>{projectName}</strong>
                <br />
                Datum: {formatDate(entry.clockInTime)}
                <br />
                Eingestempelt: {formatTime(entry.clockInTime)}
                {entry.clockOutTime && (
                  <>
                    <br />
                    Ausgestempelt: {formatTime(entry.clockOutTime)}
                    {entry.pauseTotalTime && entry.pauseTotalTime > 0 && (
                      <>
                        <br />
                        Pausenzeit: {(entry.pauseTotalTime / (1000 * 60 * 60)).toFixed(2).replace('.', ',')}h
                      </>
                    )}
                    {workHours && (
                      <>
                        <br />
                        Arbeitsstunden: {workHours}h
                      </>
                    )}
                  </>
                )}
                {!entry.clockOutTime && (
                  <>
                    <br />
                    <em>Noch eingestempelt</em>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default RecentActivities

