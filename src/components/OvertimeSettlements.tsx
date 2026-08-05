import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, OvertimeSettlement } from '../types'
import { toast } from './ToastContainer'
import ThemeToggle from './ThemeToggle'
import { minutesToHoursLabel, parseHoursMinutesInput } from '../utils/hoursInput'
import { monthKeyLabel, previousMonthKey, settleableMonthKeys } from '../utils/overtimeMonth'
import { pushNotificationService } from '../services/pushNotificationService'
import '../styles/OvertimeSettlements.css'

/**
 * Überstunden-Abrechnung aus Sicht des Mitarbeiters.
 *
 * Eintragen lässt sich für den Vormonat und den laufenden Monat: abgerechnet
 * wird üblicherweise der Monat, der gerade zu Ende ist (Anfang August also der
 * Juli), gebucht werden darf aber auch schon im laufenden Monat. Der Wert ist
 * sofort vom Überstundenkonto abgezogen und bleibt änderbar; ältere Monate
 * stehen nur noch als Verlauf da.
 *
 * Über `?month=YYYY-MM` lässt sich der Monat vorwählen – so landet der Klick
 * aus der Erinnerung direkt beim richtigen.
 */
const OvertimeSettlements: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  /** Im gewählten Monat geleistete Arbeitszeit – die Grundlage der Meldung. */
  const [workedMinutes, setWorkedMinutes] = useState<number | null>(null)

  const monthOptions = settleableMonthKeys()
  /** Vorwahl aus der Erinnerung, sonst der abzurechnende Vormonat. */
  const requestedMonth = searchParams.get('month')
  const [selectedMonth, setSelectedMonth] = useState(
    requestedMonth && monthOptions.includes(requestedMonth) ? requestedMonth : previousMonthKey()
  )

  useEffect(() => {
    loadData()
  }, [])

  /** Beim Monatswechsel den gespeicherten Wert dieses Monats ins Feld holen. */
  useEffect(() => {
    const forMonth = settlements.find(entry => entry.month === selectedMonth)
    setHoursInput(forMonth ? minutesToHoursLabel(forMonth.minutes) : '')
  }, [selectedMonth, settlements])

  /** Geleistete Stunden des gewählten Monats frisch aus den Stempelzeiten. */
  useEffect(() => {
    if (!currentUser?.id) return
    let abgebrochen = false
    setWorkedMinutes(null)
    DataService.getWorkedMinutesForMonth(currentUser.id, selectedMonth)
      .then(minutes => {
        if (!abgebrochen) setWorkedMinutes(minutes)
      })
      .catch(error => {
        console.error('Geleistete Stunden konnten nicht geladen werden:', error)
        if (!abgebrochen) setWorkedMinutes(0)
      })
    return () => {
      abgebrochen = true
    }
  }, [currentUser?.id, selectedMonth])

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
      await refreshPushState()
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Überstunden-Abrechnung')
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
  const settledSelectedMonth =
    settlements.find((entry) => entry.month === selectedMonth)?.minutes || 0
  /** Mehr als geleistet lässt sich nicht abrechnen. */
  const maxSettleableMinutes = workedMinutes ?? 0
  const eingegebeneMinuten = hoursInput.trim() === '' ? 0 : parseHoursMinutesInput(hoursInput.trim())
  /** Was nicht abgerechnet wird, wandert aufs Überstundenkonto. */
  const restAufsKonto =
    workedMinutes !== null && eingegebeneMinuten !== null
      ? Math.max(0, workedMinutes - eingegebeneMinuten)
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.id) return

    if (workedMinutes === null) {
      toast.error('Die geleisteten Stunden werden noch geladen.')
      return
    }

    const trimmed = hoursInput.trim()
    // Leeres Feld = nichts abrechnen, alle Stunden bleiben auf dem Konto.
    const minutes = trimmed === '' ? 0 : parseHoursMinutesInput(trimmed)
    if (minutes === null) {
      toast.error('Bitte Stunden als „8:30“ oder „8,5“ eingeben.')
      return
    }
    if (minutes > maxSettleableMinutes) {
      toast.error(
        `Im Monat wurden ${minutesToHoursLabel(maxSettleableMinutes)} Std geleistet – mehr lässt sich nicht abrechnen.`
      )
      return
    }

    setIsSaving(true)
    try {
      await DataService.setOvertimeSettlementMinutes(
        currentUser.id,
        selectedMonth,
        minutes,
        workedMinutes
      )
      const rest = Math.max(0, workedMinutes - minutes)
      toast.success(
        `${minutesToHoursLabel(minutes)} Std für ${monthKeyLabel(selectedMonth)} zur Abrechnung gemeldet.` +
          (rest > 0 ? ` ${minutesToHoursLabel(rest)} Std gehen aufs Überstundenkonto.` : '')
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

  const history = settlements.filter(
    (entry) => entry.minutes > 0 || monthOptions.includes(entry.month)
  )

  return (
    <div className="overtime-container">
      <header className="overtime-header">
        <button onClick={() => navigate('/time-tracking')} className="back-btn">
          Zurück
        </button>
        <h1>Stunden abrechnen</h1>
        <ThemeToggle variant="icon" className="overtime-header-theme-toggle" />
      </header>

      <div className="overtime-account card">
        <h3>{monthKeyLabel(selectedMonth)}</h3>
        <div className="overtime-stats">
          <div className="stat">
            <span className="stat-value">
              {workedMinutes === null ? '…' : minutesToHoursLabel(workedMinutes)}
            </span>
            <span className="stat-label">Geleistet</span>
          </div>
          <div className="stat">
            <span className="stat-value">{minutesToHoursLabel(settledSelectedMonth)}</span>
            <span className="stat-label">Abgerechnet</span>
          </div>
          <div className="stat">
            <span className="stat-value">{minutesToHoursLabel(balanceMinutes)}</span>
            <span className="stat-label">Überstundenkonto</span>
          </div>
        </div>
        <p className="overtime-account-note">
          Grundlage sind Ihre gestempelten Stunden des Monats. Was Sie davon nicht abrechnen
          lassen, wird dem Überstundenkonto gutgeschrieben.
        </p>
      </div>

      <div className="overtime-form card">
        <h3>Wie viele Stunden sollen für {monthKeyLabel(selectedMonth)} abgerechnet werden?</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="overtime-month">Monat:</label>
            <select
              id="overtime-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={isSaving}
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {monthKeyLabel(month)}
                  {month === previousMonthKey() ? ' (abzurechnen)' : ' (läuft noch)'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="overtime-hours">Davon abrechnen:</label>
            <input
              id="overtime-hours"
              type="text"
              inputMode="decimal"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder="z. B. 8:30 oder 8,5"
              disabled={isSaving || workedMinutes === null}
            />
            <small className="form-hint">
              Höchstens {minutesToHoursLabel(maxSettleableMinutes)} Std – so viel wurde in{' '}
              {monthKeyLabel(selectedMonth)} geleistet. Der Wert lässt sich jederzeit ändern.
            </small>
          </div>
          {restAufsKonto !== null && (
            <p className="overtime-rest">
              Aufs Überstundenkonto: <strong>{minutesToHoursLabel(restAufsKonto)} Std</strong>
            </p>
          )}
          <button
            type="submit"
            className="btn primary-btn"
            disabled={isSaving || workedMinutes === null}
          >
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
        <h3>Abgerechnete Monate</h3>
        {history.length === 0 ? (
          <p className="overtime-empty">Bisher wurden keine Stunden abgerechnet.</p>
        ) : (
          <table className="overtime-history-table">
            <thead>
              <tr>
                <th>Monat</th>
                <th className="right">Abgerechnet</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr
                  key={entry.month}
                  className={entry.month === selectedMonth ? 'is-current' : ''}
                >
                  <td>
                    {monthKeyLabel(entry.month)}
                    {monthOptions.includes(entry.month) && (
                      <span className="overtime-current-badge">änderbar</span>
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
