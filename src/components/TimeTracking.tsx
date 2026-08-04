import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, Project, TimeEntry, TimeEntryMaterialUsage } from '../types'
import ClockInForm, { type ClockInTarget } from './ClockInForm'
import ClockOutForm from './ClockOutForm'
import ManualTimeEntryModal from './ManualTimeEntryModal'
import RetroactiveDocumentationListModal from './RetroactiveDocumentationListModal'
import RecentActivities from './RecentActivities'
import { canAddManualTimeEntries } from '../constants/manualTimeEntry'
import NavigationMenu from './NavigationMenu'
import OvertimeReminderModal from './OvertimeReminderModal'
import { toast } from './ToastContainer'
import ThemeToggle from './ThemeToggle'
import { getEmployeeDisplayName } from '../utils/employeeDisplayName'
import { currentMonthKey } from '../utils/overtimeMonth'
import {
  readDismissedBroadcastAt,
  readDismissedMonth,
  shouldShowBroadcastReminder,
  shouldShowOvertimeReminder,
  writeDismissedBroadcastAt,
  writeDismissedMonth
} from '../utils/overtimeReminder'
import { APP_DISPLAY_NAME } from '../constants/appBranding'
import '../styles/TimeTracking.css'

/** Frühestmöglicher Einstempel-Zeitpunkt (06:30 Uhr) in Minuten ab Mitternacht. */
const EARLIEST_CLOCK_IN_MINUTES = 6 * 60 + 30

/** Synthetisches Projekt-Objekt für Direkt-Buchungen auf einen Kunden (Kleinauftrag). */
const buildCustomerProject = (customerName?: string): Project => ({
  id: '',
  name: customerName ? `Kleinauftrag: ${customerName}` : 'Kleinauftrag (Kunde)',
  client: customerName || ''
})

const TimeTracking: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [currentTimeEntry, setCurrentTimeEntry] = useState<TimeEntry | null>(null)
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [clockInTime, setClockInTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState('00:00:00')
  const [isLoading, setIsLoading] = useState(true)
  const [showManualEntryModal, setShowManualEntryModal] = useState(false)
  const [showRetroDocListModal, setShowRetroDocListModal] = useState(false)
  const [activitiesRefreshKey, setActivitiesRefreshKey] = useState(0)
  /** Monatsend-Erinnerung an die Überstunden-Verrechnung (null = kein Hinweis). */
  const [overtimeReminder, setOvertimeReminder] = useState<{
    month: string
    balanceMinutes: number
    /** Vom Admin ausgelöst – dann wird beim Wegklicken der Aufruf quittiert. */
    broadcastAt?: number
  } | null>(null)
  const navigate = useNavigate()

  const canManualTimeEntry = canAddManualTimeEntries(currentUser?.username)
  /** Dokumentation zu abgeschlossenen Tagen – für alle; Stempel-Nachträge nur wenn explizit erlaubt (derzeit aus). */
  const canRetroactiveDocumentation = true

  /**
   * Blendet zum Monatsende die Erinnerung an die Überstunden-Verrechnung ein.
   * Der Tagescheck läuft zuerst, damit an den übrigen Tagen des Monats gar
   * kein Firestore-Zugriff nötig ist.
   */
  const checkOvertimeReminder = async (employee: Employee) => {
    if (!employee.id) return
    const today = new Date()
    const balanceMinutes = Math.max(0, Number(employee.overtimeBalanceMinutes) || 0)
    const dismissedMonth = readDismissedMonth(employee.id)
    const month = currentMonthKey()

    if (
      !shouldShowOvertimeReminder({
        today,
        hasSettlementForMonth: false,
        balanceMinutes,
        dismissedMonth
      })
    ) {
      return
    }

    try {
      const settlement = await DataService.getOvertimeSettlement(employee.id, month)
      if (settlement) return
      setOvertimeReminder({ month, balanceMinutes })
    } catch (error) {
      console.warn('Überstunden-Erinnerung konnte nicht geprüft werden:', error)
    }
  }

  const handleDismissOvertimeReminder = () => {
    if (currentUser?.id && overtimeReminder) {
      if (overtimeReminder.broadcastAt) {
        writeDismissedBroadcastAt(currentUser.id, overtimeReminder.broadcastAt)
      } else {
        writeDismissedMonth(currentUser.id, overtimeReminder.month)
      }
    }
    setOvertimeReminder(null)
  }

  /**
   * Der Admin kann die Erinnerung von Hand auslösen. Wir hören live mit, damit
   * das Popup auch bei geöffneter App sofort erscheint – nicht erst beim
   * nächsten Laden.
   */
  useEffect(() => {
    if (!currentUser?.id) return
    const employeeId = currentUser.id
    const balanceMinutes = Math.max(0, Number(currentUser.overtimeBalanceMinutes) || 0)

    const unsubscribe = DataService.subscribeToOvertimeReminderBroadcast(async broadcast => {
      if (
        !shouldShowBroadcastReminder({
          broadcastAt: broadcast?.triggeredAt || null,
          hasSettlementForMonth: false,
          dismissedBroadcastAt: readDismissedBroadcastAt(employeeId)
        })
      ) {
        return
      }

      // Wer für den Monat schon etwas eingetragen hat, wird nicht behelligt.
      try {
        const settlement = await DataService.getOvertimeSettlement(employeeId, broadcast!.month)
        if (settlement) return
      } catch (error) {
        console.warn('Überstunden-Eintrag konnte nicht geprüft werden:', error)
      }

      setOvertimeReminder({
        month: broadcast!.month,
        balanceMinutes,
        broadcastAt: broadcast!.triggeredAt.getTime()
      })
    })

    return unsubscribe
  }, [currentUser?.id, currentUser?.overtimeBalanceMinutes])

  useEffect(() => {
    const init = async () => {
      const user = await DataService.getCurrentUser()
      if (!user || !user.id) {
        navigate('/login')
        return
      }

      setCurrentUser(user)

      // Frischen Überstunden-/Urlaubsstand nachladen (localStorage kann veraltet sein)
      DataService.getEmployeeById(user.id)
        .then(async (fresh) => {
          if (fresh) {
            setCurrentUser(fresh)
            DataService.setCurrentUser(fresh)
          }
          // Erst mit dem frischen Kontostand prüfen – sonst erinnert die App
          // womöglich an Überstunden, die längst verrechnet sind.
          await checkOvertimeReminder(fresh || user)
        })
        .catch(() => {})

      // Prüfe auf aktiven Zeiteintrag
      const timeEntry = await DataService.getCurrentTimeEntry(user.id)
      if (timeEntry) {
        setCurrentTimeEntry(timeEntry)
        const project = timeEntry.customerId && !timeEntry.projectId
          ? buildCustomerProject(timeEntry.customerName)
          : await DataService.getProjectById(timeEntry.projectId)
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

  const handleClockIn = async (target: ClockInTarget) => {
    try {
      // Einstempeln erst ab 06:30 Uhr erlauben
      const nowCheck = new Date()
      if (nowCheck.getHours() * 60 + nowCheck.getMinutes() < EARLIEST_CLOCK_IN_MINUTES) {
        toast.error('Einstempeln ist erst ab 06:30 Uhr möglich.')
        return
      }

      const location = await getCurrentLocation()
      const now = new Date()

      const isCustomerEntry = !target.projectId && !!target.customerId

      const timeEntry = await DataService.addTimeEntry({
        employeeId: currentUser!.id,
        projectId: target.projectId || '',
        ...(isCustomerEntry
          ? { customerId: target.customerId, customerName: target.customerName || '' }
          : {}),
        clockInTime: now,
        clockInLocation: location,
        notes: ''
      })

      setCurrentTimeEntry(timeEntry)
      const project = isCustomerEntry
        ? buildCustomerProject(target.customerName)
        : await DataService.getProjectById(target.projectId!)
      setCurrentProject(project)
      setClockInTime(now)

      toast.success('Sie wurden erfolgreich eingestempelt!')
    } catch (error: any) {
      toast.error('Fehler beim Einstempeln: ' + error.message)
    }
  }

  const handleProjectSwitch = async (
    newProjectId: string,
    materialUsages: TimeEntryMaterialUsage[]
  ) => {
    if (!currentTimeEntry || !currentUser?.id) return

    try {
      const location = await getCurrentLocation()
      const timeEntry = await DataService.switchActiveProject(
        currentUser.id,
        currentTimeEntry.id,
        newProjectId,
        location,
        materialUsages
      )

      const project = await DataService.getProjectById(newProjectId)
      setCurrentTimeEntry(timeEntry)
      setCurrentProject(project)

      const clockIn =
        timeEntry.clockInTime instanceof Date
          ? timeEntry.clockInTime
          : (timeEntry.clockInTime as any)?.toDate?.() || new Date()
      setClockInTime(clockIn)
      setActivitiesRefreshKey((k) => k + 1)

      toast.success(
        project?.name ? `Projekt gewechselt: ${project.name}` : 'Projekt wurde gewechselt'
      )
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unbekannter Fehler'
      toast.error('Projektwechsel fehlgeschlagen: ' + msg)
      throw error
    }
  }

  const resetClockOutState = () => {
    setCurrentTimeEntry(null)
    setCurrentProject(null)
    setClockInTime(null)
    setElapsedTime('00:00:00')
    refreshEmployeeBalances()
  }

  // Aktuellen Überstunden-/Urlaubsstand frisch laden (z. B. nach dem Ausstempeln)
  const refreshEmployeeBalances = async () => {
    const id = currentUser?.id
    if (!id) return
    try {
      const fresh = await DataService.getEmployeeById(id)
      if (fresh) {
        setCurrentUser(fresh)
        DataService.setCurrentUser(fresh)
      }
    } catch {
      /* Saldo-Refresh ist optional */
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
        <div className="time-tracking-logo">
          <img 
            src="/brand-logo.png" 
            alt="Logo" 
            className="time-tracking-logo-image"
          />
          <h1>{APP_DISPLAY_NAME}</h1>
          <p>Mitarbeiter-Zeiterfassung</p>
        </div>
      </header>

      <main className="time-tracking-main">
        <div className="user-info-section">
          <div className="user-info-row">
            <NavigationMenu onLogout={handleLogout} />
            <p className="user-info-greeting">
              Angemeldet als: <strong>{getEmployeeDisplayName(currentUser)}</strong>
            </p>
            <ThemeToggle variant="icon" className="user-info-theme-toggle" />
          </div>
          {typeof currentUser?.overtimeBalanceMinutes === 'number' && (
            <p className="user-info-overtime">
              Überstundenkonto:{' '}
              <strong>
                {`${Math.floor(Math.max(0, currentUser.overtimeBalanceMinutes) / 60)}:${String(
                  Math.max(0, currentUser.overtimeBalanceMinutes) % 60
                ).padStart(2, '0')} h`}
              </strong>
            </p>
          )}
        </div>

        {(canManualTimeEntry || canRetroactiveDocumentation) && (
          <div className="manual-time-entry-banner">
            <p className="manual-time-entry-banner-text">
              {canManualTimeEntry
                ? 'Sie können vergessene Stempelzeiten nachtragen sowie Dokumentation zu abgeschlossenen Tagen ergänzen.'
                : 'Sie können Dokumentation (Fotos/Notizen) zu bereits abgeschlossenen Arbeitstagen ergänzen.'}
            </p>
            <div className="manual-time-entry-actions">
              {canManualTimeEntry && (
                <button
                  type="button"
                  className="manual-time-entry-open-btn"
                  onClick={() => setShowManualEntryModal(true)}
                >
                  Stempelzeit nachtragen
                </button>
              )}
              {canRetroactiveDocumentation && (
                <button
                  type="button"
                  className="manual-time-entry-secondary-btn"
                  onClick={() => setShowRetroDocListModal(true)}
                >
                  Bericht nachtragen
                </button>
              )}
            </div>
          </div>
        )}

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
            key={currentTimeEntry.id}
            timeEntry={currentTimeEntry}
            project={currentProject}
            clockInTime={clockInTime}
            onExtendedClockOutSuccess={resetClockOutState}
            onProjectSwitch={handleProjectSwitch}
            onUpdate={() => {
              // Reload time entry inkl. Anzeigezustand
              DataService.getCurrentTimeEntry(currentUser.id!).then(async (entry) => {
                setCurrentTimeEntry(entry)

                if (!entry) {
                  resetClockOutState()
                  return
                }

                const project = await DataService.getProjectById(entry.projectId)
                setCurrentProject(project)

                const clockIn = entry.clockInTime instanceof Date
                  ? entry.clockInTime
                  : entry.clockInTime?.toDate?.() || new Date(entry.clockInTime)
                setClockInTime(clockIn)
              })
            }}
          />
        )}

        <RecentActivities employeeId={currentUser.id!} refreshKey={activitiesRefreshKey} />

        {showManualEntryModal && (
          <ManualTimeEntryModal
            addedBy={currentUser}
            onClose={() => setShowManualEntryModal(false)}
            onSuccess={() => setActivitiesRefreshKey((k) => k + 1)}
          />
        )}

        {showRetroDocListModal && currentUser && (
          <RetroactiveDocumentationListModal
            employee={currentUser}
            onClose={() => setShowRetroDocListModal(false)}
            onDocumentationSaved={() => setActivitiesRefreshKey((k) => k + 1)}
          />
        )}

        {overtimeReminder && (
          <OvertimeReminderModal
            month={overtimeReminder.month}
            balanceMinutes={overtimeReminder.balanceMinutes}
            onDismiss={handleDismissOvertimeReminder}
          />
        )}
      </main>
    </div>
  )
}

export default TimeTracking

