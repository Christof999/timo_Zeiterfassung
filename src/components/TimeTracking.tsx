import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, Project, TimeEntry, TimeEntryMaterialUsage } from '../types'
import type { OvertimeDayFillPlan } from '../services/dataService'
import ClockInForm, { type ClockInTarget } from './ClockInForm'
import ClockOutForm from './ClockOutForm'
import ManualTimeEntryModal from './ManualTimeEntryModal'
import RetroactiveDocumentationListModal from './RetroactiveDocumentationListModal'
import SickLeaveModal from './SickLeaveModal'
import SchoolDayModal from './SchoolDayModal'
import RecentActivities from './RecentActivities'
import { canAddManualTimeEntries } from '../constants/manualTimeEntry'
import NavigationMenu from './NavigationMenu'
import OvertimeReminderModal from './OvertimeReminderModal'
import OvertimeDayFillModal from './OvertimeDayFillModal'
import { toast } from './ToastContainer'
import ThemeToggle from './ThemeToggle'
import { getEmployeeDisplayName } from '../utils/employeeDisplayName'
import { currentMonthKey, settleableMonthKeys } from '../utils/overtimeMonth'
import { formatDateForInputLocal } from '../utils/dateUtils'
import { minutesToHoursLabel } from '../utils/hoursInput'
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

/**
 * Was sich heute aus dem Überstundenkonto auffüllen lässt – null, wenn nichts
 * anzubieten ist. Bewusst außerhalb der Komponente, damit sowohl der erste
 * Ladevorgang als auch spätere Aktualisierungen denselben Weg nehmen.
 */
const loadDayFillPlan = async (employeeId: string): Promise<OvertimeDayFillPlan | null> => {
  try {
    const plan = await DataService.getOvertimeDayFillPlan(
      employeeId,
      formatDateForInputLocal(new Date())
    )
    return plan.canFill ? plan : null
  } catch (error) {
    console.warn('Auffüllbare Stunden konnten nicht ermittelt werden:', error)
    return null
  }
}

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
  const [showSickLeaveModal, setShowSickLeaveModal] = useState(false)
  const [showSchoolDayModal, setShowSchoolDayModal] = useState(false)
  const [activitiesRefreshKey, setActivitiesRefreshKey] = useState(0)
  /** Was sich heute aus dem Überstundenkonto auffüllen lässt (null = nichts). */
  const [dayFillPlan, setDayFillPlan] = useState<OvertimeDayFillPlan | null>(null)
  const [showDayFillModal, setShowDayFillModal] = useState(false)
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

  /**
   * Prüft, ob der heutige Tag unter der Regelarbeitszeit liegt und aus dem
   * Überstundenkonto aufgefüllt werden kann. Läuft nach dem Laden und nach
   * jedem Ausstempeln – solange jemand eingestempelt ist, wächst die Tageszeit
   * noch und der Knopf bleibt aus.
   */
  const refreshDayFillPlan = async (employeeId?: string) => {
    const id = employeeId || currentUser?.id
    if (!id) return
    setDayFillPlan(await loadDayFillPlan(id))
  }

  const handleConfirmDayFill = async () => {
    if (!currentUser?.id || !dayFillPlan) return
    try {
      const { filledMinutes } = await DataService.fillDayWithOvertime(
        currentUser.id,
        formatDateForInputLocal(new Date())
      )
      setShowDayFillModal(false)
      setDayFillPlan(null)
      await refreshEmployeeBalances()
      await refreshDayFillPlan(currentUser.id)
      setActivitiesRefreshKey((k) => k + 1)
      toast.success(
        `Heute um ${minutesToHoursLabel(filledMinutes)} Std aus dem Überstundenkonto aufgefüllt.`
      )
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unbekannter Fehler'
      toast.error('Auffüllen fehlgeschlagen: ' + msg)
      // Der Plan kann veraltet sein (z. B. Korrektur durch den Admin).
      await refreshDayFillPlan(currentUser.id)
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

    // Gezielte Erinnerung des Admins an genau diesen Mitarbeiter. Anders als
    // beim Aufruf an alle erscheint sie auch, wenn schon eine Meldung vorliegt:
    // der Admin bittet dann ausdrücklich darum, sie zu prüfen oder zu ändern.
    const unsubscribePersonal = DataService.subscribeToPersonalOvertimeReminder(
      employeeId,
      reminder => {
        if (
          !shouldShowBroadcastReminder({
            broadcastAt: reminder?.triggeredAt || null,
            hasSettlementForMonth: false,
            dismissedBroadcastAt: readDismissedBroadcastAt(employeeId)
          })
        ) {
          return
        }
        // Das Dokument bleibt liegen. Auf einem neuen Gerät soll es nicht nach
        // Monaten wieder aufpoppen, wenn sich für den Monat längst nichts mehr
        // melden lässt.
        if (!settleableMonthKeys().includes(reminder!.month)) return
        setOvertimeReminder({
          month: reminder!.month,
          balanceMinutes,
          broadcastAt: reminder!.triggeredAt.getTime()
        })
      }
    )

    return () => {
      unsubscribe()
      unsubscribePersonal()
    }
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
      loadDayFillPlan(user.id).then(setDayFillPlan)
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
      // Solange gestempelt wird, wächst die Tageszeit weiter.
      setDayFillPlan(null)

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
    // Erst jetzt steht die Tageszeit fest – der Auffüll-Knopf kann erscheinen.
    refreshDayFillPlan()
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

        {!currentTimeEntry && dayFillPlan && (
          <div className="day-fill-banner">
            <p className="day-fill-banner-text">
              Heute sind <strong>{minutesToHoursLabel(dayFillPlan.workedMinutes)} Std</strong> von{' '}
              <strong>{minutesToHoursLabel(dayFillPlan.regularMinutes)} Std</strong> erfasst. Sie
              können {minutesToHoursLabel(dayFillPlan.fillMinutes)} Std aus Ihrem
              Überstundenkonto auffüllen.
            </p>
            <button
              type="button"
              className="day-fill-btn"
              onClick={() => setShowDayFillModal(true)}
            >
              Tag mit Überstunden auffüllen
            </button>
          </div>
        )}

        {/* Abwesenheiten: Krankmeldung für alle, Ausbildungstag nur für Azubis */}
        <div className="absence-actions">
          <button
            type="button"
            className="btn secondary-btn absence-actions-btn"
            onClick={() => setShowSickLeaveModal(true)}
          >
            Krank
          </button>
          {currentUser.isApprentice === true && (
            <button
              type="button"
              className="btn secondary-btn absence-actions-btn"
              onClick={() => setShowSchoolDayModal(true)}
            >
              Schule / Handwerkskammer
            </button>
          )}
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

        {showSickLeaveModal && currentUser && (
          <SickLeaveModal
            employee={currentUser}
            onClose={() => setShowSickLeaveModal(false)}
            onSuccess={() => setActivitiesRefreshKey((k) => k + 1)}
          />
        )}

        {showSchoolDayModal && currentUser && (
          <SchoolDayModal
            employee={currentUser}
            onClose={() => setShowSchoolDayModal(false)}
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

        {showDayFillModal && dayFillPlan && (
          <OvertimeDayFillModal
            plan={dayFillPlan}
            onConfirm={handleConfirmDayFill}
            onClose={() => setShowDayFillModal(false)}
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

