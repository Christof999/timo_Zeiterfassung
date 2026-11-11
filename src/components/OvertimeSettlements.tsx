import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, OvertimeSettlement } from '../types'
import { toast } from './ToastContainer'
import EmployeePageHeader from './EmployeePageHeader'
import {
  floorToQuarterHour,
  minutesFromHourMinuteFields,
  minutesToHoursLabel
} from '../utils/hoursInput'
import { maxSettleableMinutes } from '../utils/overtimeBalance'
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
/** Abgerechnet wird nur in Viertelstunden (Vorgabe des Kunden). */
const QUARTER_MINUTES = ['00', '15', '30', '45']

const OvertimeSettlements: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [settlements, setSettlements] = useState<OvertimeSettlement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  /** Stunden und Minuten getrennt – siehe minutesFromHourMinuteFields. */
  const [hoursInput, setHoursInput] = useState('')
  const [minutesInput, setMinutesInput] = useState('')
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

  /**
   * Beim Monatswechsel den gespeicherten Wert dieses Monats ins Feld holen.
   * Ohne Meldung stehen die geleisteten Stunden als Vorschlag drin: ein leeres
   * Feld wurde sonst mit „Übernehmen" als 0 Std gemeldet, und der ganze Monat
   * landete auf dem Überstundenkonto statt in der Abrechnung.
   */
  useEffect(() => {
    const forMonth = settlements.find(entry => entry.month === selectedMonth)
    const gespeichert = forMonth ? forMonth.minutes : workedMinutes
    if (gespeichert === null) {
      setHoursInput('')
      setMinutesInput('')
      return
    }
    // Abgerechnet wird nur in Viertelstunden – ein alter Wert wie 170:50 wird
    // zu 170:45, der Rest bleibt auf dem Überstundenkonto.
    const vorschlag = floorToQuarterHour(gespeichert)
    setHoursInput(String(Math.floor(vorschlag / 60)))
    setMinutesInput(String(Math.round(vorschlag % 60)).padStart(2, '0'))
  }, [selectedMonth, settlements, workedMinutes])

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
  const eintragDesMonats = settlements.find((entry) => entry.month === selectedMonth) ?? null
  const settledSelectedMonth = eintragDesMonats?.minutes || 0
  /**
   * Abrechenbar sind die geleisteten Stunden plus das Überstundenkonto – wer
   * mehr abrechnet als er geleistet hat, lässt sich Überstunden auszahlen.
   */
  const maxSettleable =
    workedMinutes === null
      ? 0
      : floorToQuarterHour(maxSettleableMinutes(balanceMinutes, eintragDesMonats, workedMinutes))
  const eingegebeneMinuten = minutesFromHourMinuteFields(hoursInput, minutesInput)
  /** Positiv = geht aufs Konto, negativ = wird vom Konto ausgezahlt. */
  const kontoBewegung =
    workedMinutes !== null && eingegebeneMinuten !== null
      ? workedMinutes - eingegebeneMinuten
      : null

  /**
   * Stundenfeld: nimmt nur Ziffern. Wer „100:45" am Stück tippt oder einfügt,
   * bekommt die Minuten automatisch ins zweite Feld.
   */
  const handleHoursChange = (value: string) => {
    const amStueck = /^(\d{1,4}):(\d{0,2})$/.exec(value.trim())
    if (amStueck) {
      setHoursInput(amStueck[1])
      const minuten = Math.min(59, Number(amStueck[2] || 0))
      setMinutesInput(String(floorToQuarterHour(minuten)).padStart(2, '0'))
      return
    }
    setHoursInput(value.replace(/\D/g, '').slice(0, 4))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.id) return

    if (workedMinutes === null) {
      toast.error('Die geleisteten Stunden werden noch geladen.')
      return
    }

    // Ein leeres Feld ist keine Meldung: 0 Std muss ausdrücklich dastehen.
    if (hoursInput.trim() === '') {
      toast.error('Bitte die Stunden eintragen, die abgerechnet werden sollen.')
      return
    }
    const minutes = eingegebeneMinuten
    if (minutes === null) {
      toast.error('Bitte gültige Stunden und Minuten (0–59) eintragen.')
      return
    }
    if (
      minutes === 0 &&
      workedMinutes > 0 &&
      !confirm(
        `Wirklich 0 Std für ${monthKeyLabel(selectedMonth)} abrechnen? Dann wird nichts ausgezahlt und alle ${minutesToHoursLabel(workedMinutes)} Std gehen aufs Überstundenkonto.`
      )
    ) {
      return
    }
    if (minutes > maxSettleable) {
      toast.error(
        `Höchstens ${minutesToHoursLabel(maxSettleable)} Std möglich: ${minutesToHoursLabel(workedMinutes)} Std geleistet plus Überstundenkonto.`
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
      const bewegung = workedMinutes - minutes
      toast.success(
        `${minutesToHoursLabel(minutes)} Std für ${monthKeyLabel(selectedMonth)} zur Abrechnung gemeldet.` +
          (bewegung > 0
            ? ` ${minutesToHoursLabel(bewegung)} Std gehen aufs Überstundenkonto.`
            : bewegung < 0
              ? ` ${minutesToHoursLabel(-bewegung)} Std kommen vom Überstundenkonto.`
              : '')
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
    <div className="employee-page overtime-container">
      <EmployeePageHeader title="Stunden abrechnen" employee={currentUser} />
      <main className="employee-page-main">

      <section className="overtime-account employee-card">
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
        <details className="employee-help"><summary>So funktioniert die Abrechnung</summary><p>
          Grundlage sind Ihre gestempelten Stunden des Monats. Was Sie davon nicht abrechnen
          lassen, wird dem Überstundenkonto gutgeschrieben. Sie können auch mehr abrechnen als
          geleistet – dann werden Überstunden vom Konto ausgezahlt.
        </p></details>
      </section>

      <section className="overtime-form employee-card">
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
            <div className="overtime-time-fields">
              <input
                id="overtime-hours"
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={hoursInput}
                onChange={(e) => handleHoursChange(e.target.value)}
                placeholder="100"
                aria-label="Stunden"
                disabled={isSaving || workedMinutes === null}
              />
              <span className="overtime-time-colon" aria-hidden="true">:</span>
              <select
                id="overtime-minutes"
                value={minutesInput}
                onChange={(e) => setMinutesInput(e.target.value)}
                aria-label="Minuten"
                disabled={isSaving || workedMinutes === null}
              >
                {QUARTER_MINUTES.map((minuten) => (
                  <option key={minuten} value={minuten}>
                    {minuten}
                  </option>
                ))}
              </select>
            </div>
            <small className="form-hint">
              Abgerechnet wird in Viertelstunden, z. B. 100:45 = 100,75 Std.
            </small>
            <small className="form-hint">
              Höchstens {minutesToHoursLabel(maxSettleable)} Std:{' '}
              {workedMinutes === null ? '…' : minutesToHoursLabel(workedMinutes)} Std geleistet plus
              Ihr Überstundenkonto. Der Wert lässt sich jederzeit ändern.
            </small>
          </div>
          {kontoBewegung !== null && (
            <p className="overtime-rest">
              {kontoBewegung >= 0 ? (
                <>
                  Aufs Überstundenkonto:{' '}
                  <strong>{minutesToHoursLabel(kontoBewegung)} Std</strong>
                </>
              ) : (
                <>
                  Vom Überstundenkonto ausgezahlt:{' '}
                  <strong>{minutesToHoursLabel(-kontoBewegung)} Std</strong>
                </>
              )}
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
      </section>

      <details className="overtime-push employee-card">
        <summary className="employee-disclosure">Erinnerung aufs Handy</summary>
        {pushState.supported ? (
          <>
            <p className="overtime-push-status">
              Status: <strong>{pushState.active ? 'aktiv' : 'nicht aktiv'}</strong>
            </p>
            <button
              type="button"
              className="btn secondary-btn"
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
      </details>

      <section className="overtime-history employee-card">
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
      </section>
      </main>
    </div>
  )
}

export default OvertimeSettlements
