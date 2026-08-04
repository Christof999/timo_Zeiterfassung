import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, OvertimeSettlement } from '../types'
import { toast } from './ToastContainer'
import ThemeToggle from './ThemeToggle'
import { minutesToHoursLabel, parseHoursMinutesInput } from '../utils/hoursInput'
import { currentMonthKey, monthKeyLabel } from '../utils/overtimeMonth'
import { pushNotificationService } from '../services/pushNotificationService'
import '../styles/OvertimeSettlements.css'

/**
 * Überstunden-Verrechnung aus Sicht des Mitarbeiters.
 *
 * Der eingetragene Wert gilt für den laufenden Monat und ist sofort vom
 * Überstundenkonto abgezogen – auch mitten im Monat. Solange der Monat läuft,
 * lässt er sich beliebig oft korrigieren; abgeschlossene Monate stehen nur
 * noch als Verlauf da.
 */
const OvertimeSettlements: React.FC = () => {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [settlements, setSettlements] = useState<OvertimeSettlement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hoursInput, setHoursInput] = useState('')
  /** Benachrichtigungen aufs Handy – ohne Anmeldung erreicht der Admin-Aufruf dieses Gerät nicht. */
  const [pushState, setPushState] = useState<{ supported: boolean; reason?: string; active: boolean }>(
    { supported: false, active: false }
  )
  const [isTogglingPush, setIsTogglingPush] = useState(false)

  const thisMonth = currentMonthKey()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const user = await DataService.getCurrentUser()
      if (!user) {
        toast.error('Bitte melden Sie sich an')
        navigate('/login')
        return
      }

      // Der Kontostand im localStorage kann veraltet sein – die Stammdaten
      // sind hier die Wahrheit, sonst rechnet die Seite gegen einen alten Wert.
      let record = user
      if (user.id) {
        try {
          const fresh = await DataService.getEmployeeById(user.id)
          if (fresh) record = fresh
        } catch (error) {
          console.warn('Überstundenkonto konnte nicht frisch geladen werden:', error)
        }
      }
      setCurrentUser(record)

      const entries = await DataService.getOvertimeSettlements(record.id!)
      setSettlements(entries)
      const forThisMonth = entries.find((entry) => entry.month === thisMonth)
      setHoursInput(forThisMonth ? minutesToHoursLabel(forThisMonth.minutes) : '')
      await refreshPushState()
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Überstunden-Verrechnung')
    } finally {
      setIsLoading(false)
    }
  }

  const refreshPushState = async () => {
    const support = pushNotificationService.getSupportState()
    if (!support.isSupported) {
      setPushState({ supported: false, reason: support.reason, active: false })
      return
    }
    const existing = await pushNotificationService.getCurrentSubscription()
    setPushState({ supported: true, active: !!existing })
  }

  const handleTogglePush = async () => {
    if (!currentUser) return
    setIsTogglingPush(true)
    try {
      if (pushState.active) {
        await pushNotificationService.disableSubscription('employee')
        toast.success('Benachrichtigungen ausgeschaltet.')
      } else {
        await pushNotificationService.requestAndSaveSubscription(
          { id: currentUser.id, username: currentUser.username, name: currentUser.name },
          'employee'
        )
        toast.success('Benachrichtigungen aktiviert.')
      }
      await refreshPushState()
    } catch (error: any) {
      toast.error(error?.message || 'Benachrichtigungen konnten nicht geändert werden.')
    } finally {
      setIsTogglingPush(false)
    }
  }

  const balanceMinutes = Math.max(0, Number(currentUser?.overtimeBalanceMinutes) || 0)
  const settledThisMonth = settlements.find((entry) => entry.month === thisMonth)?.minutes || 0
  /** Bereits verrechnete Stunden sind abgezogen – für eine Korrektur nach oben zählen sie mit. */
  const maxSettleableMinutes = balanceMinutes + settledThisMonth

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.id) return

    const trimmed = hoursInput.trim()
    // Leeres Feld = nichts verrechnen. Das gibt bereits gebuchte Stunden zurück.
    const minutes = trimmed === '' ? 0 : parseHoursMinutesInput(trimmed)
    if (minutes === null) {
      toast.error('Bitte Stunden als „8:30“ oder „8,5“ eingeben.')
      return
    }
    if (minutes > maxSettleableMinutes) {
      toast.error(
        `Nicht genügend Überstunden: verfügbar sind ${minutesToHoursLabel(maxSettleableMinutes)} Std.`
      )
      return
    }

    setIsSaving(true)
    try {
      await DataService.setOvertimeSettlementMinutes(currentUser.id, thisMonth, minutes)
      toast.success(
        minutes > 0
          ? `${minutesToHoursLabel(minutes)} Std für ${monthKeyLabel(thisMonth)} verrechnet.`
          : `Verrechnung für ${monthKeyLabel(thisMonth)} zurückgenommen.`
      )
      await loadData()
    } catch (error: any) {
      toast.error(error?.message || 'Speichern fehlgeschlagen')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="overtime-container">
        <div className="loading">Lade Überstunden…</div>
      </div>
    )
  }

  const history = settlements.filter((entry) => entry.minutes > 0 || entry.month === thisMonth)

  return (
    <div className="overtime-container">
      <header className="overtime-header">
        <button onClick={() => navigate('/time-tracking')} className="back-btn">
          Zurück
        </button>
        <h1>Überstunden verrechnen</h1>
        <ThemeToggle variant="icon" className="overtime-header-theme-toggle" />
      </header>

      <div className="overtime-account card">
        <h3>Ihr Überstundenkonto</h3>
        <div className="overtime-stats">
          <div className="stat">
            <span className="stat-value">{minutesToHoursLabel(balanceMinutes)}</span>
            <span className="stat-label">Verfügbar</span>
          </div>
          <div className="stat">
            <span className="stat-value">{minutesToHoursLabel(settledThisMonth)}</span>
            <span className="stat-label">Diesen Monat verrechnet</span>
          </div>
        </div>
        <p className="overtime-account-note">
          Verrechnete Stunden sind sofort vom Konto abgezogen – auch wenn der Monat noch läuft.
        </p>
      </div>

      <div className="overtime-form card">
        <h3>{monthKeyLabel(thisMonth)} – laufender Monat</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="overtime-hours">Zu verrechnende Überstunden:</label>
            <input
              id="overtime-hours"
              type="text"
              inputMode="decimal"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder="z. B. 8:30 oder 8,5"
              disabled={isSaving}
            />
            <small className="form-hint">
              Maximal {minutesToHoursLabel(maxSettleableMinutes)} Std. Der Wert lässt sich bis zum
              Monatsende jederzeit ändern; leer lassen nimmt die Verrechnung zurück.
            </small>
          </div>
          <button type="submit" className="btn primary-btn" disabled={isSaving}>
            {isSaving ? 'Speichere…' : 'Übernehmen'}
          </button>
        </form>
      </div>

      <div className="overtime-push card">
        <h3>Erinnerung aufs Handy</h3>
        {pushState.supported ? (
          <>
            <p className="overtime-push-status">
              Status: <strong>{pushState.active ? 'aktiv' : 'nicht aktiv'}</strong>
            </p>
            <button
              type="button"
              className={`btn ${pushState.active ? 'secondary-btn' : 'primary-btn'}`}
              onClick={handleTogglePush}
              disabled={isTogglingPush}
            >
              {isTogglingPush
                ? 'Einen Moment…'
                : pushState.active
                  ? 'Benachrichtigungen ausschalten'
                  : 'Benachrichtigungen einschalten'}
            </button>
            <small className="form-hint">
              Zum Monatsende erinnert dich die App dann auch auf dem Startbildschirm daran, deine
              Stunden einzutragen.
            </small>
          </>
        ) : (
          <p className="overtime-push-status">{pushState.reason}</p>
        )}
      </div>

      <div className="overtime-history card">
        <h3>Verrechnete Monate</h3>
        {history.length === 0 ? (
          <p className="overtime-empty">Bisher wurden keine Überstunden verrechnet.</p>
        ) : (
          <table className="overtime-history-table">
            <thead>
              <tr>
                <th>Monat</th>
                <th className="right">Verrechnet</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.month} className={entry.month === thisMonth ? 'is-current' : ''}>
                  <td>
                    {monthKeyLabel(entry.month)}
                    {entry.month === thisMonth && (
                      <span className="overtime-current-badge">läuft noch · änderbar</span>
                    )}
                  </td>
                  <td className="right">{minutesToHoursLabel(entry.minutes)} Std</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default OvertimeSettlements
