import type { Employee, LeaveRequest, TimeEntry } from '../../../../types'
import { formatDateForInputLocal } from '../../../../utils/dateUtils'
import { minutesToHoursLabel } from '../../../../utils/hoursInput'
import { getReturnTravelCreditMs } from '../../../../utils/returnTravel'
import {
  allocateOvertimePayout,
  applyWorkTimeRules,
  MAX_DAILY_WORK_MINUTES,
  type WorkTimeAdjustment,
  type WorkTimeDaySummary,
  type WorkTimeRowInput
} from './workTimeRules'

// Reine Berechnungs- und Formatierungslogik der Berichte/Nachkalkulation.
// Bewusst ohne React-/Komponenten-Abhängigkeiten, damit sie testbar bleibt.

export type ReportType = 'employee' | 'project' | 'datev'
export type ReportEntrySource = 'time-entry' | 'leave-request'

/**
 * Bezahlte Abwesenheit; alle werden mit der Regelarbeitszeit vergütet.
 * `school` = Berufsschultag eines Azubis.
 */
export type AbsenceKind = 'vacation' | 'holiday' | 'sick' | 'school'

export const VACATION_WORK_MINUTES = 8 * 60
export const VACATION_WORK_HOURS_LABEL = '8:00'

export interface ReportEntry {
  id: string
  originalEntry: TimeEntry
  source: ReportEntrySource
  date: string
  dateRaw: Date | null
  dateKey: string
  projectId: string
  projectName: string
  clockIn: string
  clockOut: string
  pauseMinutes: number
  pauseMs: number
  workHours: string
  notes: string
  originalNotes: string
  isEdited: boolean
  isReadOnly?: boolean
  holidayName?: string | null
  /** gesetzt bei Urlaub, Feiertag und Krankheit — Basis für die Beleg-Summen */
  absenceKind?: AbsenceKind
}

export interface EmployeeSummary {
  employeeId: string
  employeeName: string
  totalHours: number
  hourlyRate: number
  totalCost: number
  /** Lohnkosten je Std (Kostensatz + Lohnnebenkosten); 0 wenn nichts hinterlegt */
  hourlyCostRate: number
  /** Personalkosten intern = Stunden × Lohnkostensatz (nur wenn hinterlegt) */
  totalPurchaseCost: number
  /** true, wenn ein Lohnkostensatz hinterlegt ist (fließt in Einkauf/Marge ein) */
  hasCostRate: boolean
}

/**
 * Lohnkosten-Satz eines Mitarbeiters in EUR/Std – die Grundlage aller Beträge
 * im Zeiterfassungsbericht (inkl. DATEV-Nachweis).
 *
 * Bewusst „was kostet mich der Mitarbeiter" + Lohnnebenkosten und **nicht** der
 * Verrechnungssatz (`hourlyRate`): der Verrechnungssatz ist der Preis, zu dem
 * die Stunde verkauft wird, und gehört damit in die Nachkalkulation
 * (Verrechnungssatz − Lohnkosten = Marge). Als Lohn ausgewiesen wäre er zu hoch.
 */
export const employeeLaborCostRate = (
  employee?: Pick<Employee, 'hourlyCostRate' | 'ancillaryWageCosts'> | null
): number => {
  const value = (input: number | undefined): number =>
    typeof input === 'number' && isFinite(input) && input > 0 ? input : 0
  return (
    Math.round((value(employee?.hourlyCostRate) + value(employee?.ancillaryWageCosts)) * 100) / 100
  )
}

/**
 * Verrechnungssatz eines Mitarbeiters in EUR/Std – der Preis, zu dem die Stunde
 * verkauft wird. Grundlage der Nachkalkulation, nie des Lohnbelegs.
 *
 * `hourlyWage` ist das ältere Feld; die Mitarbeiterkarte pflegt `hourlyRate`
 * und zeigt `hourlyWage` nur noch, solange nichts Neues hinterlegt ist. Die
 * Reihenfolge hier ist bewusst dieselbe, damit in der Auswertung genau der Satz
 * steht, den man im Profil sieht.
 */
export const employeeBillingRate = (
  employee?: Pick<Employee, 'hourlyRate' | 'hourlyWage'> | null
): number => {
  const value = (input: number | undefined): number =>
    typeof input === 'number' && isFinite(input) && input > 0 ? input : 0
  return value(employee?.hourlyRate) || value(employee?.hourlyWage)
}

/**
 * Marge einer Personalstunde: Verrechnungssatz − Lohnkosten. Das ist der
 * Rohertrag, der nach dem Mitarbeiter übrig bleibt.
 */
export const employeeHourlyMargin = (
  employee?: Pick<
    Employee,
    'hourlyRate' | 'hourlyWage' | 'hourlyCostRate' | 'ancillaryWageCosts'
  > | null
): number =>
  Math.round((employeeBillingRate(employee) - employeeLaborCostRate(employee)) * 100) / 100

/**
 * Steht der Mitarbeiter im Zeiterfassungsbericht zur Auswahl?
 *
 * Ausgeschlossen sind ausgeschiedene Mitarbeiter und das technische
 * Administrator-Konto. Das Häkchen „Administrator" ist bewusst KEIN
 * Ausschlussgrund: es vergibt nur das Recht, sich im Admin-Bereich anzumelden,
 * und wird auch von Leuten geführt, die selbst stempeln (Geschäftsführung,
 * Vorarbeiter). Die stünden sonst ohne Lohnbeleg da.
 */
export const isReportSelectableEmployee = (employee: Employee): boolean => {
  if (employee.status === 'inactive') return false
  const name = (employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`)
    .trim()
    .toLowerCase()
  const username = (employee.username || '').trim().toLowerCase()
  // Nur das Sammelkonto selbst, nicht jeder, in dessen Namen „admin" vorkommt.
  return username !== 'admin' && name !== 'admin' && name !== 'administrator'
}

export const convertToDate = (date: unknown): Date | null => {
  if (!date) return null
  const withToDate = date as { toDate?: () => Date; seconds?: number }
  if (withToDate?.toDate) return withToDate.toDate()
  if (withToDate?.seconds) return new Date(withToDate.seconds * 1000)
  if (date instanceof Date) return date
  const d = new Date(date as string | number)
  return isNaN(d.getTime()) ? null : d
}

export const formatDateForDisplay = (date: Date): string => {
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export const parseDateInputAsLocalDate = (value: string): Date | null => {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return isNaN(date.getTime()) ? null : date
}

export const getDateKey = (date: Date): string => formatDateForInputLocal(date)

export const isWeekendDate = (date: Date): boolean => {
  const day = date.getDay()
  return day === 0 || day === 6
}

export const getWeekStart = (date: Date): Date => {
  const start = new Date(date)
  start.setHours(12, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export const getWeekEnd = (date: Date): Date => {
  const end = getWeekStart(date)
  end.setDate(end.getDate() + 6)
  return end
}

export const enumerateDays = (start: Date, end: Date): Date[] => {
  const days: Date[] = []
  const current = new Date(start)
  current.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)
  while (current <= last) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export const isLeaveDateCancelled = (request: LeaveRequest, dateKey: string): boolean =>
  (request.cancelledDates || []).some((key) => String(key).slice(0, 10) === dateKey)

/**
 * Genehmigte Abwesenheitstage eines Typs im Zeitraum.
 *
 * `blockedDates` hält Tage frei, die schon anderweitig belegt sind: gestempelte
 * Zeiten und gesetzliche Feiertage. An einem Feiertag kann niemand Urlaub
 * nehmen oder krank sein — der Feiertag gewinnt.
 */
export const getApprovedLeaveDates = (
  requests: LeaveRequest[],
  type: LeaveRequest['type'],
  rangeStart: Date,
  rangeEnd: Date,
  blockedDates: Set<string>
): Array<{ date: Date; request: LeaveRequest }> => {
  const vacationDates = new Map<string, { date: Date; request: LeaveRequest }>()
  const start = new Date(rangeStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(rangeEnd)
  end.setHours(23, 59, 59, 999)

  for (const request of requests) {
    if (request.status !== 'approved' || request.type !== type) continue
    const reqStart = convertToDate(request.startDate)
    const reqEnd = convertToDate(request.endDate)
    if (!reqStart || !reqEnd) continue

    const first = new Date(Math.max(
      new Date(reqStart.getFullYear(), reqStart.getMonth(), reqStart.getDate()).getTime(),
      start.getTime()
    ))
    const last = new Date(Math.min(
      new Date(reqEnd.getFullYear(), reqEnd.getMonth(), reqEnd.getDate()).getTime(),
      end.getTime()
    ))
    if (last < first) continue

    for (const date of enumerateDays(first, last)) {
      const dateKey = getDateKey(date)
      if (isWeekendDate(date)) continue
      if (blockedDates.has(dateKey)) continue
      if (isLeaveDateCancelled(request, dateKey)) continue
      if (!vacationDates.has(dateKey)) {
        vacationDates.set(dateKey, { date, request })
      }
    }
  }

  return [...vacationDates.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Rückwärtskompatibler Kurzschluss für Urlaubstage. */
export const getApprovedVacationDates = (
  requests: LeaveRequest[],
  rangeStart: Date,
  rangeEnd: Date,
  blockedDates: Set<string>
): Array<{ date: Date; request: LeaveRequest }> =>
  getApprovedLeaveDates(requests, 'vacation', rangeStart, rangeEnd, blockedDates)

export const formatTimeForInput = (date: Date | null): string => {
  if (!date) return ''
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

// Dezimalstunden (z. B. 7.83) in „X Std Y Min" umwandeln.
export const formatHoursMinutes = (decimalHours: number): string => {
  if (!decimalHours || decimalHours <= 0) return '0 Std 0 Min'
  const totalMinutes = Math.round(decimalHours * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} Std ${minutes} Min`
}

export const calculateWorkHours = (
  clockIn: string,
  clockOut: string,
  pauseMinutes: number,
  extraMinutes = 0
): string => {
  if (!clockIn || !clockOut) return '-'
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return '-'
  // Brutto-Anwesenheit (Gehen - Kommen). Nur wenn DIESE negativ ist, lag die
  // Stempelung ueber Mitternacht -> 24h addieren. Die Pause erst DANACH
  // abziehen, sonst wuerde eine Pause > Arbeitszeit faelschlich als
  // Nachtschicht interpretiert (z. B. 10 Min - 30 Min Pause -> 23:40).
  let grossMinutes = (outH * 60 + outM) - (inH * 60 + inM)
  if (grossMinutes < 0) grossMinutes += 24 * 60
  let totalMinutes = grossMinutes - pauseMinutes + extraMinutes
  // Negative Arbeitszeit (Pause laenger als Anwesenheit) als 0:00 zeigen.
  if (totalMinutes < 0) totalMinutes = 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

export const msToMinutes = (ms: number): number => Math.round(ms / (1000 * 60))

/** Beim Ausstempeln gutgeschriebene Fahrtzeit laut Entfernungs-Staffel (in Minuten). */
export const entryCreditMinutes = (entry: TimeEntry): number =>
  msToMinutes(getReturnTravelCreditMs(entry))

export const workMinutesFromParts = (clockIn: string, clockOut: string, pauseMinutes: number): number => {
  if (!clockIn || !clockOut) return 0
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0
  // Mitternachts-Erkennung auf Basis der Brutto-Anwesenheit, NICHT nach
  // Pausenabzug (sonst wird Pause > Arbeitszeit als Nachtschicht missgedeutet).
  let grossMinutes = outH * 60 + outM - (inH * 60 + inM)
  if (grossMinutes < 0) grossMinutes += 24 * 60
  return Math.max(0, grossMinutes - pauseMinutes)
}

export { minutesToHoursLabel, minutesToDecimalHours } from '../../../../utils/hoursInput'

export const workMinutesFromOriginalEntry = (entry: TimeEntry): number => {
  if (entry.isVacationDay) return VACATION_WORK_MINUTES
  const clockInDate = convertToDate(entry.clockInTime)
  const clockOutDate = convertToDate(entry.clockOutTime)
  const cin = formatTimeForInput(clockInDate)
  const cout = formatTimeForInput(clockOutDate)
  const pauseMinutes = msToMinutes(entry.pauseTotalTime || 0)
  return workMinutesFromParts(cin, cout, pauseMinutes) + entryCreditMinutes(entry)
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

export const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const formatNotesForPrintHtml = (notes: string): string => {
  if (!notes.trim()) return '—'
  return escapeHtml(notes).replace(/\n/g, '<br />')
}

/**
 * Legt eine Uhrzeit aus einem `<input type="time">` ("HH:MM") auf den Tag eines
 * Stempelsatzes. Gibt null zurück, wenn die Eingabe unbrauchbar ist.
 */
export const buildDateFromTimeInput = (baseDate: Date, value: string): Date | null => {
  if (!baseDate || !value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  const date = new Date(baseDate)
  date.setHours(hours, minutes, 0, 0)
  return date
}

export interface ReportRowChanges {
  clockIn: boolean
  clockOut: boolean
  pause: boolean
  project: boolean
  /** Kommen-Zeit des gespeicherten Satzes (geglättet, "HH:MM" oder "") */
  originalClockIn: string
  /** Gehen-Zeit des gespeicherten Satzes (geglättet, "HH:MM" oder "") */
  originalClockOut: string
  /** true, wenn irgendein Feld gegenüber der Datenbank abweicht */
  any: boolean
}

/**
 * Vergleicht eine (ggf. bearbeitete) Berichtszeile mit dem gespeicherten
 * Stempelsatz. Grundlage der Direkt-Speicherung: nur wirklich geänderte Felder
 * werden geschrieben, damit ungeglättete Rohzeiten sonst unangetastet bleiben.
 */
export const getReportRowChanges = (
  entry: ReportEntry,
  roundTime: (date: Date | null) => Date | null
): ReportRowChanges => {
  const original = entry.originalEntry
  const originalClockIn = formatTimeForInput(roundTime(convertToDate(original.clockInTime)))
  const originalClockOut = formatTimeForInput(roundTime(convertToDate(original.clockOutTime)))
  const originalPauseMinutes = msToMinutes(original.pauseTotalTime || 0)

  const clockIn = entry.clockIn !== originalClockIn
  const clockOut = entry.clockOut !== originalClockOut
  const pause = entry.pauseMinutes !== originalPauseMinutes
  const project = !!entry.projectId && entry.projectId !== original.projectId

  return {
    clockIn,
    clockOut,
    pause,
    project,
    originalClockIn,
    originalClockOut,
    any: clockIn || clockOut || pause || project
  }
}

export const workMinutesFromReportEntry = (entry: ReportEntry): number => {
  if (entry.workHours && entry.workHours !== '-') {
    const [h, m] = entry.workHours.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m
  }
  return 0
}

// ---------------------------------------------------------------------------
// Gesetzliche Korrektur + Überstunden-Ausweisung (reine Anzeige)
// ---------------------------------------------------------------------------

/**
 * Berichtszeile inklusive der im Bericht ausgewiesenen Werte.
 *
 * Die `effective*`-Felder sind bewusst von `pauseMinutes`/`clockOut` getrennt:
 * gespeichert wird ausschließlich aus den Originalfeldern (siehe
 * `getReportRowChanges`), die Korrektur bleibt damit garantiert außerhalb der
 * Datenbank.
 */
export interface AdjustedReportEntry extends ReportEntry {
  effectivePauseMinutes: number
  effectiveClockOut: string
  effectiveWorkMinutes: number
  effectiveWorkHours: string
  workTimeAdjustments: WorkTimeAdjustment[]
}

/** Steuerlicher Verpflegungsmehraufwand: Satz je Tag ab 8 Std Abwesenheit. */
export const DEFAULT_MEAL_ALLOWANCE_EUR = 14
export const MEAL_ALLOWANCE_FROM_MINUTES = 8 * 60

/**
 * Eingabefeld „Verpflegungsmehraufwand €/Tag" → Satz in EUR.
 *
 * 0 ist ausdrücklich erlaubt und bedeutet „kein Verpflegungsmehraufwand".
 * Währungszeichen und Leerzeichen werden geschluckt: Das Feld ist mit „€/Tag"
 * beschriftet, also tippt man dort erfahrungsgemäß auch „0 €" – das darf nicht
 * als ungültig gelten und auf den Standardsatz zurückfallen.
 *
 * Leeres Feld = 0. Nur wirklich nicht deutbare Eingaben fallen auf 14 zurück.
 */
export const parseMealAllowanceInput = (raw: string): number => {
  const cleaned = (raw || '')
    .replace(/[€\s]/g, '')
    .replace(/,/g, '.')
  if (cleaned === '') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MEAL_ALLOWANCE_EUR
}

/**
 * Die Summen, die Petra für die Lohnabrechnung meldet. Alle Beträge ergeben
 * sich aus Stunden × Stundenlohn; die Stunden kommen aus der ausgewiesenen
 * (gesetzlich korrigierten) Sicht, nicht aus den Rohzeiten.
 */
export interface ReportSettlementSummary {
  /** geleistete Arbeitsstunden ohne Urlaub/Feiertag/Krankheit */
  workMinutes: number
  workAmount: number
  /** nicht abgerechnete, also im Konto verbleibende Überstunden */
  openOvertimeMinutes: number
  /** Tage mit mindestens 8 Std Anwesenheit */
  mealAllowanceDays: number
  mealAllowanceRate: number
  mealAllowanceAmount: number
  /** Urlaub wird in TAGEN gemeldet – der Baulohn rechnet ihn selbst. */
  vacationDays: number
  vacationMinutes: number
  vacationAmount: number
  holidayMinutes: number
  holidayAmount: number
  sickDays: number
  sickMinutes: number
  sickAmount: number
  /** Berufsschultage (Azubis) – bezahlt, aber keine geleistete Arbeitszeit. */
  schoolDays: number
  schoolMinutes: number
  schoolAmount: number
  hourlyRate: number
  /**
   * Der Betrag, den der Steuerberater meldet. Bei Stundenlohn: alle
   * lohnwirksamen Stunden × Stundenlohn – ohne Urlaub, den der Baulohn
   * gesondert abrechnet. Bei Azubis: der Fixlohn. Enthält nie den steuerfreien
   * Verpflegungsmehraufwand.
   */
  grossWageAmount: number
  /** Stunden, auf denen der Bruttolohn beruht (bei Fixlohn nur nachrichtlich) */
  grossWageMinutes: number
  /** Steuerfreie Zuwendungen (aktuell nur Verpflegungsmehraufwand) */
  taxFreeAmount: number
  /** Bruttolohn + steuerfreie Zuwendungen = was tatsächlich überwiesen wird */
  totalPayoutAmount: number
  /** true = Azubi mit Fixlohn; dann steht neben den Zeiten kein Stundensatz. */
  isFixedSalary: boolean
}

/**
 * Plant, wie eine gemeldete Gesamtstundenzahl auf die Tage verteilt wird.
 *
 * Gesucht ist der höchste einheitliche Tagesdeckel, mit dem die Summe das Ziel
 * noch nicht überschreitet; der verbleibende Rest wird anschließend über die
 * vorhandene Überstunden-Verteilung ergänzt. Damit trifft die Ausweisung das
 * Ziel exakt – und zwar in beide Richtungen:
 *
 * - Ziel unter der gestempelten Zeit → die längsten Tage werden zuerst gekürzt
 * - Ziel über der gestempelten Zeit → die Differenz wird als ausbezahlte
 *   Überstunden auf die Tage verteilt (bis zur 10-Std-Grenze)
 *
 * @param dayMinutes geleistete Minuten je Tag
 * @param targetMinutes gemeldete Gesamtminuten
 */
export const planSettlementTarget = (
  dayMinutes: number[],
  targetMinutes: number
): { dailyCapMinutes: number; payoutMinutes: number } => {
  const ziel = Math.max(0, Math.round(targetMinutes))
  const summeBei = (deckel: number): number =>
    dayMinutes.reduce((sum, minutes) => sum + Math.min(minutes, deckel), 0)

  // Binäre Suche über den Tagesdeckel. Die Summe wächst monoton mit dem
  // Deckel, deshalb ist der größte Deckel mit Summe ≤ Ziel eindeutig.
  let unten = 0
  let oben = MAX_DAILY_WORK_MINUTES
  while (unten < oben) {
    const mitte = Math.floor((unten + oben + 1) / 2)
    if (summeBei(mitte) <= ziel) unten = mitte
    else oben = mitte - 1
  }

  return { dailyCapMinutes: unten, payoutMinutes: Math.max(0, ziel - summeBei(unten)) }
}

export interface BuildAdjustedReportOptions {
  regularDayMinutes?: number | ((dateKey: string) => number) | null
  requestedPayoutMinutes?: number
  /** Lohnkostensatz für die Beträge auf dem Beleg (siehe employeeLaborCostRate) */
  hourlyRate?: number
  /** Satz je Tag Verpflegungsmehraufwand */
  mealAllowanceRate?: number
  /** Azubi: Vergütung über Fixlohn statt Stundensatz */
  isApprentice?: boolean
  /** Monatlicher Fixlohn (EUR) – nur bei Azubis */
  fixedMonthlySalary?: number
  /** Überstundenkonto des Mitarbeiters (für „nicht abgerechnete Überstunden") */
  overtimeBalanceMinutes?: number | null
}

export interface AdjustedReport {
  entries: AdjustedReportEntry[]
  days: WorkTimeDaySummary[]
  /** Summe wie gestempelt */
  stampedTotalMinutes: number
  /** Summe nach gesetzlicher Pausen-/10-Std-Korrektur */
  legalTotalMinutes: number
  /** Summe, die Tabelle und Ausdruck zeigen */
  shownTotalMinutes: number
  /**
   * Gesamtzeit, die auf dem Beleg steht: alles außer Urlaub. Urlaub wird im
   * Baulohn gesondert abgerechnet und deshalb weder mit Stunden ausgewiesen
   * noch mitsummiert – gemeldet werden nur die Urlaubstage.
   */
  documentTotalMinutes: number
  /** im Zeitraum über der Regelarbeitszeit angefallen */
  overtimeAvailableMinutes: number
  /** tatsächlich auf die Zeilen verteilte Auszahlung */
  payoutMinutes: number
  /** davon über die gestempelte Zeit hinaus verteilt */
  payoutBeyondActualMinutes: number
  /** angefordert, aber nicht unterzubringen */
  payoutUnallocatedMinutes: number
  /** Tage mit mindestens 8 Std Anwesenheit (Verpflegungsmehraufwand) */
  mealAllowanceDays: number
  /** Summen für den Abrechnungsbeleg */
  summary: ReportSettlementSummary
}

const isFixedReportEntry = (entry: ReportEntry): boolean =>
  entry.source === 'leave-request' || !!entry.isReadOnly

/**
 * Legt die gesetzlichen Regeln (und optional Regelarbeitszeit-Deckelung samt
 * Überstunden-Auszahlung) über die Berichtszeilen. Ergebnis ist eine reine
 * Anzeige-Sicht — die übergebenen Zeilen bleiben unverändert.
 */
export const buildAdjustedReport = (
  entries: ReportEntry[],
  options: BuildAdjustedReportOptions = {}
): AdjustedReport => {
  const {
    regularDayMinutes = null,
    requestedPayoutMinutes = 0,
    hourlyRate = 0,
    mealAllowanceRate = DEFAULT_MEAL_ALLOWANCE_EUR,
    isApprentice = false,
    fixedMonthlySalary = 0,
    overtimeBalanceMinutes = null
  } = options

  // Beim Fixlohn gibt es keinen Stundensatz – die Zeilen weisen nur Zeiten aus.
  const useFixedSalary = isApprentice === true

  const orderByDate = new Map<string, number>()
  const rowInputs: WorkTimeRowInput[] = entries.map((entry) => {
    const order = orderByDate.get(entry.dateKey) || 0
    orderByDate.set(entry.dateKey, order + 1)
    return {
      id: entry.id,
      dateKey: entry.dateKey,
      order,
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
      pauseMinutes: entry.pauseMinutes,
      creditMinutes: entryCreditMinutes(entry.originalEntry),
      isFixed: isFixedReportEntry(entry)
    }
  })

  // Erst ohne Auszahlung rechnen, um den verfügbaren Überhang je Tag zu kennen.
  const base = applyWorkTimeRules(rowInputs, { regularDayMinutes })
  const allocation = allocateOvertimePayout(base.days, requestedPayoutMinutes)
  const final =
    allocation.allocatedMinutes > 0
      ? applyWorkTimeRules(rowInputs, { regularDayMinutes, payoutByDate: allocation.byDate })
      : base

  const adjusted: AdjustedReportEntry[] = entries.map((entry) => {
    const result = final.rows.get(entry.id)
    if (!result || isFixedReportEntry(entry)) {
      // Urlaubstage & Co. behalten ihre feste Ausweisung (z. B. 8:00).
      const minutes = workMinutesFromReportEntry(entry)
      return {
        ...entry,
        effectivePauseMinutes: entry.pauseMinutes,
        effectiveClockOut: entry.clockOut,
        effectiveWorkMinutes: minutes,
        effectiveWorkHours: entry.workHours,
        workTimeAdjustments: []
      }
    }
    return {
      ...entry,
      effectivePauseMinutes: result.pauseMinutes,
      effectiveClockOut: result.clockOut,
      effectiveWorkMinutes: result.workMinutes,
      effectiveWorkHours:
        entry.clockIn && entry.clockOut ? minutesToHoursLabel(result.workMinutes) : entry.workHours,
      workTimeAdjustments: result.adjustments
    }
  })

  const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)
  // Urlaubstage & Co. laufen nicht durch das Regelwerk, ihre feste Ausweisung
  // muss aber in jeder Summe stecken.
  const fixedMinutes = sum(entries.filter(isFixedReportEntry).map(workMinutesFromReportEntry))

  const minutesOfKind = (kind: AbsenceKind): number =>
    sum(adjusted.filter((entry) => entry.absenceKind === kind).map((e) => e.effectiveWorkMinutes))
  const amountFor = (minutes: number): number =>
    Math.round((minutes / 60) * hourlyRate * 100) / 100

  const mealAllowanceDays = base.days.filter(
    (day) => day.attendanceMinutes >= MEAL_ALLOWANCE_FROM_MINUTES
  ).length

  // Geleistete Arbeitszeit = alles, was kein Urlaub, Feiertag oder Krankheit ist.
  const workMinutes = sum(
    adjusted.filter((entry) => !entry.absenceKind).map((entry) => entry.effectiveWorkMinutes)
  )
  const daysOfKind = (kind: AbsenceKind): number =>
    adjusted.filter((entry) => entry.absenceKind === kind).length
  const vacationMinutes = minutesOfKind('vacation')
  const vacationDays = daysOfKind('vacation')
  const holidayMinutes = minutesOfKind('holiday')
  const sickMinutes = minutesOfKind('sick')
  const sickDays = daysOfKind('sick')
  const schoolMinutes = minutesOfKind('school')
  const schoolDays = daysOfKind('school')

  // „Nicht abgerechnet" = was nach der Auszahlung im Konto stehen bleibt.
  const openOvertimeMinutes =
    typeof overtimeBalanceMinutes === 'number'
      ? Math.max(0, overtimeBalanceMinutes - allocation.allocatedMinutes)
      : sum(base.days.map((day) => day.overtimeMinutes)) - allocation.allocatedMinutes

  // Der Beleg muss aufgehen: die Summe entsteht aus den gerundeten Einzelzeilen,
  // nicht aus einer zweiten Rechnung über die Gesamtminuten.
  const round2 = (value: number): number => Math.round(value * 100) / 100
  // Beim Fixlohn bleiben die Zeilenbeträge leer: die Zeiten werden ausgewiesen,
  // vergütet wird aber pauschal.
  const workAmount = useFixedSalary ? 0 : amountFor(workMinutes)
  const vacationAmount = useFixedSalary ? 0 : amountFor(vacationMinutes)
  const holidayAmount = useFixedSalary ? 0 : amountFor(holidayMinutes)
  const sickAmount = useFixedSalary ? 0 : amountFor(sickMinutes)
  const schoolAmount = useFixedSalary ? 0 : amountFor(schoolMinutes)
  const mealAllowanceAmount = round2(mealAllowanceDays * mealAllowanceRate)

  // Lohnwirksam ist jede bezahlte Stunde – Arbeit wie Lohnfortzahlung.
  //
  // AUSNAHME URLAUB: Im Baulohn wird der Urlaub über die Urlaubskasse gesondert
  // abgerechnet (Wunsch der Steuerkanzlei). Er steht deshalb nur noch mit der
  // Anzahl der Tage auf dem Beleg und ist im Bruttolohn NICHT enthalten – sonst
  // würde er doppelt vergütet.
  const grossWageMinutes = workMinutes + holidayMinutes + sickMinutes + schoolMinutes
  const grossWageAmount = useFixedSalary
    ? round2(Math.max(0, fixedMonthlySalary))
    : round2(workAmount + holidayAmount + sickAmount + schoolAmount)

  return {
    entries: adjusted,
    days: base.days,
    stampedTotalMinutes: sum(base.days.map((day) => day.stampedWorkMinutes)) + fixedMinutes,
    legalTotalMinutes: sum(base.days.map((day) => day.legalWorkMinutes)) + fixedMinutes,
    shownTotalMinutes: sum(adjusted.map((entry) => entry.effectiveWorkMinutes)),
    documentTotalMinutes: sum(
      adjusted
        .filter((entry) => entry.absenceKind !== 'vacation')
        .map((entry) => entry.effectiveWorkMinutes)
    ),
    overtimeAvailableMinutes: sum(base.days.map((day) => day.overtimeMinutes)),
    payoutMinutes: allocation.allocatedMinutes,
    payoutBeyondActualMinutes: allocation.beyondActualMinutes,
    payoutUnallocatedMinutes: allocation.unallocatedMinutes,
    mealAllowanceDays,
    summary: {
      workMinutes,
      workAmount,
      openOvertimeMinutes: Math.max(0, openOvertimeMinutes),
      mealAllowanceDays,
      mealAllowanceRate,
      mealAllowanceAmount,
      vacationDays,
      vacationMinutes,
      vacationAmount,
      holidayMinutes,
      holidayAmount,
      sickDays,
      sickMinutes,
      sickAmount,
      schoolDays,
      schoolMinutes,
      schoolAmount,
      hourlyRate: useFixedSalary ? 0 : hourlyRate,
      grossWageMinutes,
      grossWageAmount,
      taxFreeAmount: mealAllowanceAmount,
      totalPayoutAmount: round2(grossWageAmount + mealAllowanceAmount),
      isFixedSalary: useFixedSalary
    }
  }
}

/**
 * Auswertung, die eine gemeldete Zielsumme exakt trifft.
 *
 * Erst ungedeckelt rechnen, um die tatsächlichen Tagesminuten zu kennen, dann
 * Tagesdeckel und Auszahlung so wählen, dass die ausgewiesene Arbeitszeit auf
 * die Meldung des Mitarbeiters kommt. Identisch genutzt in der Einzelansicht
 * („Übernehmen") und im Sammellauf über alle Mitarbeiter.
 */
export const buildAdjustedReportForTarget = (
  entries: ReportEntry[],
  options: BuildAdjustedReportOptions,
  targetMinutes: number
): AdjustedReport => {
  const ungedeckelt = buildAdjustedReport(entries, options)
  const plan = planSettlementTarget(
    ungedeckelt.days.map((day) => day.legalWorkMinutes),
    targetMinutes
  )
  return buildAdjustedReport(entries, {
    ...options,
    regularDayMinutes: plan.dailyCapMinutes,
    requestedPayoutMinutes: plan.payoutMinutes
  })
}
