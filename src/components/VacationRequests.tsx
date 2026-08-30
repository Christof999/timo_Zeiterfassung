import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, LeaveRequest } from '../types'
import { SCHOOL_DAY_LABELS } from '../types'
import { toast } from './ToastContainer'
import ThemeToggle from './ThemeToggle'
import { getTodayLocalDateString } from '../utils/dateUtils'
import '../styles/VacationRequests.css'
import { REGULAR_MINUTES_MON_THU, leaveMinutesForRange } from '../utils/regularWorkTime'
import {
  countLeaveWorkingDays,
  effectiveLeaveWorkingDays,
  leaveWorkingDaysInYear
} from '../utils/workingDays'
import { getBavariaHolidayName } from '../utils/bavariaHolidays'

// Reguläre Tagesarbeitszeit in Minuten (= Kosten eines „Urlaub auf Überstunden"-Tages).
// Regelarbeitszeit Mo–Do; für die grobe Tages-Schätzung des Überstunden-Urlaubs.
const REGULAR_DAY_MINUTES = REGULAR_MINUTES_MON_THU

/**
 * "2026-08-24" als Datum auf 12:00 Ortszeit – so wie es die
 * Abwesenheitsmeldungen speichern. Ohne Uhrzeit läge der Wert auf
 * UTC-Mitternacht und könnte je nach Zeitzone auf den Vortag rutschen.
 */
const parseInputDate = (value: string): Date => new Date(`${value}T12:00:00`)

/** Minuten als "8:00" darstellen. */
const formatMinutes = (minutes: number): string =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

/** Gesetzliche Feiertage (ohne Wochenende) im gewählten Zeitraum. */
const holidaysInRange = (start: Date, end: Date): string[] => {
  const current = new Date(start)
  current.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)
  const names: string[] = []
  while (current <= last) {
    const day = current.getDay()
    const name = day !== 0 && day !== 6 ? getBavariaHolidayName(current) : null
    if (name) names.push(`${current.toLocaleDateString('de-DE')} ${name}`)
    current.setDate(current.getDate() + 1)
  }
  return names
}

const VacationRequests: React.FC = () => {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  
  // Formular-State
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'vacation' as LeaveRequest['type'],
    reason: ''
  })
  const [workingDays, setWorkingDays] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Arbeitstage berechnen wenn Datum sich ändert
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const start = parseInputDate(formData.startDate)
      const end = parseInputDate(formData.endDate)
      if (end >= start) {
        const days = countLeaveWorkingDays(start, end)
        setWorkingDays(days)
      } else {
        setWorkingDays(0)
      }
    } else {
      setWorkingDays(0)
    }
  }, [formData.startDate, formData.endDate])

  const loadData = async () => {
    try {
      const user = await DataService.getCurrentUser()
      if (!user) {
        toast.error('Bitte melden Sie sich an')
        navigate('/login')
        return
      }
      setCurrentUser(user)

      const requests = await DataService.getLeaveRequestsByEmployee(user.id!)
      // Sortieren nach Erstellungsdatum (neueste zuerst)
      requests.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt)
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt)
        return dateB.getTime() - dateA.getTime()
      })
      setLeaveRequests(requests)
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Daten')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentUser) return
    
    if (parseInputDate(formData.endDate) < parseInputDate(formData.startDate)) {
      toast.error('Das Enddatum muss nach dem Startdatum liegen')
      return
    }

    if (workingDays === 0) {
      toast.error('Der Zeitraum enthält keine Arbeitstage')
      return
    }

    if (formData.type === 'overtime') {
      // Gleiche Rechnung wie bei der Genehmigung: Freitag kostet nur 6 Std,
      // Feiertage kosten gar nichts.
      const neededMinutes = leaveMinutesForRange(
        parseInputDate(formData.startDate),
        parseInputDate(formData.endDate)
      )
      if (overtimeMinutes < neededMinutes) {
        toast.error(
          `Nicht genügend Überstunden: ${overtimeHoursLabel} h vorhanden, ${workingDays} Tag(e) benötigen ${formatMinutes(neededMinutes)} h.`
        )
        return
      }
    }

    setIsSubmitting(true)
    try {
      await DataService.createLeaveRequest({
        employeeId: currentUser.id!,
        employeeName: currentUser.name || `${currentUser.firstName} ${currentUser.lastName}`,
        startDate: parseInputDate(formData.startDate),
        endDate: parseInputDate(formData.endDate),
        type: formData.type,
        reason: formData.reason,
        workingDays
      })

      toast.success('Urlaubsantrag erfolgreich eingereicht!')
      setShowForm(false)
      setFormData({ startDate: '', endDate: '', type: 'vacation', reason: '' })
      loadData()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Antrag wirklich löschen?')) return
    
    try {
      await DataService.deleteLeaveRequest(id)
      toast.success('Antrag gelöscht')
      loadData()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    }
  }

  const getTypeLabel = (type: LeaveRequest['type'], schoolKind?: LeaveRequest['schoolKind']) => {
    switch (type) {
      case 'vacation': return 'Urlaub'
      case 'sick': return 'Krankheit'
      case 'special': return 'Sonderurlaub'
      case 'unpaid': return 'Unbezahlt'
      case 'overtime': return 'Urlaub auf Überstunden'
      // Ausbildungstage tragen seit der Selbstbuchung den genauen Grund
      case 'school': return schoolKind ? SCHOOL_DAY_LABELS[schoolKind] : 'Berufsschule'
      default: return type
    }
  }

  const getStatusBadge = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'pending':
        return <span className="vacation-status-badge pending">Ausstehend</span>
      case 'approved':
        return <span className="vacation-status-badge approved">Genehmigt</span>
      case 'rejected':
        return <span className="vacation-status-badge rejected">Abgelehnt</span>
      default:
        return <span className="vacation-status-badge">{status}</span>
    }
  }

  const toDate = (value: any): Date | null => {
    if (!value) return null
    const d = value?.toDate?.() || new Date(value)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDate = (date: any) => {
    const d = toDate(date)
    if (!d) return '-'
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Urlaubskonto: "Genutzt" wird komplett aus den genehmigten Anträgen des
  // laufenden Jahres abgeleitet – ohne Wochenenden, ohne gesetzliche Feiertage
  // und ohne stornierte Tage. Das gilt damit auch rückwirkend für Anträge, die
  // noch mit der alten Zählung (Feiertage inklusive) gespeichert wurden.
  //
  // Der Zähler `vacationDays.used` wird bewusst nicht mehr addiert: er wurde
  // früher beim Genehmigen hochgezählt, inzwischen nicht mehr. Würde man ihn
  // weiter als Basis nehmen, zählten alte Urlaube doppelt – einmal im Zähler,
  // einmal über die Ableitung.
  const currentYear = new Date().getFullYear()
  const vacationAccount = currentUser?.vacationDays || { total: 30, used: 0, year: currentYear }
  const totalVacationDays = Number(vacationAccount.total || 30)

  const usedForAccount = leaveRequests.reduce((sum, request) => {
    if (request.type !== 'vacation' || request.status !== 'approved') {
      return sum
    }
    return sum + leaveWorkingDaysInYear(request, currentYear)
  }, 0)
  const remaining = Math.max(0, totalVacationDays - usedForAccount)

  // Überstundenkonto
  const overtimeMinutes = Math.max(0, Number(currentUser?.overtimeBalanceMinutes) || 0)
  const overtimeHoursLabel = `${Math.floor(overtimeMinutes / 60)}:${String(overtimeMinutes % 60).padStart(2, '0')}`
  const overtimeDaysAvailable = Math.floor(overtimeMinutes / REGULAR_DAY_MINUTES)
  const canUseOvertime = overtimeMinutes >= REGULAR_DAY_MINUTES

  // Heutiges Datum – nur noch, um Nachträge im Formular zu kennzeichnen.
  // Ein Mindestdatum gibt es bewusst nicht: Urlaub darf auch rückwirkend
  // beantragt werden (z.B. ein vergessener Tag aus dem Vormonat).
  const today = getTodayLocalDateString()
  const isBackdated = !!formData.startDate && formData.startDate < today

  // Feiertage im gewählten Zeitraum – sie kosten keinen Urlaubstag, das soll
  // im Formular auch so dastehen und nicht wie ein Rechenfehler wirken.
  const selectedHolidays =
    formData.startDate && formData.endDate
      ? holidaysInRange(parseInputDate(formData.startDate), parseInputDate(formData.endDate))
      : []

  if (isLoading) {
    return (
      <div className="vacation-container">
        <div className="loading">Lade Urlaubsanträge...</div>
      </div>
    )
  }

  return (
    <div className="vacation-container">
      <header className="vacation-header">
        <button onClick={() => navigate('/time-tracking')} className="back-btn">
          Zurück
        </button>
        <h1>Urlaubsanträge</h1>
        <ThemeToggle variant="icon" className="vacation-header-theme-toggle" />
      </header>

      {/* Urlaubskonto */}
      <div className="vacation-account card">
        <h3>Ihr Urlaubskonto {currentYear}</h3>
        <div className="vacation-stats">
          <div className="stat">
            <span className="stat-value">{remaining}</span>
            <span className="stat-label">Verfügbar</span>
          </div>
          <div className="stat">
            <span className="stat-value">{usedForAccount}</span>
            <span className="stat-label">Genutzt</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalVacationDays}</span>
            <span className="stat-label">Gesamt</span>
          </div>
        </div>
        <div className="vacation-progress">
          <div
            className="vacation-progress-bar"
            style={{ width: `${totalVacationDays > 0 ? Math.min(100, (usedForAccount / totalVacationDays) * 100) : 0}%` }}
          />
        </div>
        <p className="vacation-overtime-line">
          Überstundenkonto: <strong>{overtimeHoursLabel} h</strong>
          {canUseOvertime ? ` · bis zu ${overtimeDaysAvailable} Tag(e) als „Urlaub auf Überstunden“ möglich` : ''}
        </p>
      </div>

      {/* Neuen Antrag Button */}
      {!showForm && (
        <button onClick={() => setShowForm(true)} className="btn primary-btn new-request-btn">
          Neuen Antrag stellen
        </button>
      )}

      {/* Antragsformular */}
      {showForm && (
        <div className="vacation-form card">
          <div className="form-header">
            <h3>Neuer Urlaubsantrag</h3>
            <button onClick={() => setShowForm(false)} className="close-btn">×</button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Von:</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Bis:</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  min={formData.startDate || undefined}
                  required
                />
              </div>
            </div>

            {isBackdated && (
              <div className="working-days-info info">
                Nachträglicher Antrag – der Zeitraum liegt in der Vergangenheit.
              </div>
            )}

            {workingDays > 0 && (
              formData.type === 'overtime' ? (
                <div className={`working-days-info ${workingDays > overtimeDaysAvailable ? 'warning' : 'info'}`}>
                  {workingDays > overtimeDaysAvailable ? (
                    <>{workingDays} Tage beantragt, aber nur {overtimeDaysAvailable} über Überstunden möglich</>
                  ) : (
                    <>{workingDays} Arbeitstage (vom Überstundenkonto)</>
                  )}
                </div>
              ) : (
                <div className={`working-days-info ${workingDays > remaining ? 'warning' : 'info'}`}>
                  {workingDays > remaining ? (
                    <>{workingDays} Arbeitstage beantragt, aber nur {remaining} verfügbar</>
                  ) : (
                    <>{workingDays} Arbeitstage</>
                  )}
                </div>
              )
            )}

            {selectedHolidays.length > 0 && (
              <div className="working-days-info info">
                {selectedHolidays.length === 1 ? 'Feiertag' : 'Feiertage'} im Zeitraum –
                kostet keinen Urlaubstag: {selectedHolidays.join(', ')}
              </div>
            )}

            <div className="form-group">
              <label>Art des Urlaubs:</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as LeaveRequest['type'] })}
              >
                <option value="vacation">Urlaub</option>
                <option value="special">Sonderurlaub</option>
                <option value="unpaid">Unbezahlter Urlaub</option>
                {canUseOvertime && (
                  <option value="overtime">Urlaub auf Überstunden ({overtimeHoursLabel} h)</option>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Grund / Bemerkung (optional):</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="z.B. Familienfeier, Umzug..."
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="button" onClick={() => setShowForm(false)} className="btn secondary-btn">
                Abbrechen
              </button>
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Wird eingereicht...' : 'Antrag einreichen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste der Anträge */}
      <div className="requests-list">
        <h3>Meine Anträge</h3>
        
        {leaveRequests.length === 0 ? (
          <p className="no-data">Noch keine Urlaubsanträge vorhanden</p>
        ) : (
          leaveRequests.map((request) => (
            <div key={request.id} className={`request-card card status-${request.status}`}>
              <div className="request-header">
                <span className="request-type">{getTypeLabel(request.type, request.schoolKind)}</span>
                {getStatusBadge(request.status)}
              </div>
              
              <div className="request-dates">
                <span className="date-range">
                  {formatDate(request.startDate)} - {formatDate(request.endDate)}
                </span>
                <span className="days-count">{effectiveLeaveWorkingDays(request)} Arbeitstage</span>
              </div>
              
              {request.reason && (
                <p className="request-reason">{request.reason}</p>
              )}
              
              {request.status === 'rejected' && request.rejectionReason && (
                <p className="rejection-reason">
                  <strong>Ablehnungsgrund:</strong> {request.rejectionReason}
                </p>
              )}
              
              <div className="request-footer">
                <span className="request-date">
                  Eingereicht am {formatDate(request.createdAt)}
                </span>
                {request.status === 'pending' && (
                  <button 
                    onClick={() => handleDelete(request.id!)} 
                    className="delete-btn"
                    title="Antrag löschen"
                  >
                    Löschen
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default VacationRequests
