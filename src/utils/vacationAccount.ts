import { leaveWorkingDayKeys, type LeaveDayRange } from './workingDays'

/** Bau, Vollzeit: 30 Tage im Jahr = 2,5 Tage je Monat. */
export const FULL_TIME_MONTHLY_VACATION_DAYS = 2.5

/**
 * Urlaubskonto, übernommen aus der Lohnabrechnung (Baulohn).
 *
 * Die Lohnabrechnung ist die Quelle: ihr Resturlaub zum Stichtag ist der
 * Anfangsbestand. Ab dann rechnet die App selbst weiter – Monatsanspruch
 * dazu, genehmigte Urlaubstage ab. Kein Jahreswechsel-Reset: im Bau wird
 * der Resturlaub ins Folgejahr übernommen.
 */
export interface VacationAccount {
  /** Resturlaub in Tagen am Ende des Stichtagsmonats, inklusive Vorjahresrest. */
  openingDays: number
  /** Monat der Lohnabrechnung, aus der der Resturlaub stammt (YYYY-MM). */
  asOfMonth: string
  /** Anspruch je abgerechnetem Monat in Tagen. */
  monthlyDays: number
}

export interface VacationBalance {
  /** Seit dem Stichtag hinzugekommener Anspruch. */
  earned: number
  /** Genehmigte Urlaubstage nach dem Stichtag – auch bereits verplante künftige. */
  taken: number
  remaining: number
}

type VacationRequest = LeaveDayRange & { type: string; status: string }

const monthIndex = (yearMonth: string) => {
  const [year, month] = yearMonth.split('-').map(Number)
  return year * 12 + month - 1
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Ein Monat wird gutgeschrieben, sobald er vorbei ist – so wie auf der
 * Lohnabrechnung. Mitte November zählt also noch der Stand Ende Oktober.
 */
export const completedMonthsSince = (asOfMonth: string, today: Date): number =>
  Math.max(0, today.getFullYear() * 12 + today.getMonth() - monthIndex(asOfMonth) - 1)

export const vacationBalance = (
  account: VacationAccount,
  requests: VacationRequest[],
  today: Date
): VacationBalance => {
  const earned = round2(completedMonthsSince(account.asOfMonth, today) * account.monthlyDays)
  const taken = requests
    .filter((request) => request.type === 'vacation' && request.status === 'approved')
    .flatMap(leaveWorkingDayKeys)
    .filter((dateKey) => dateKey.slice(0, 7) > account.asOfMonth).length
  return { earned, taken, remaining: round2(account.openingDays + earned - taken) }
}

/** „2,5" statt „2.5", höchstens zwei Nachkommastellen. */
export const formatVacationDays = (days: number): string =>
  days.toLocaleString('de-DE', { maximumFractionDigits: 2 })

/** „2026-10" → „Oktober 2026". */
export const formatAsOfMonth = (asOfMonth: string): string => {
  const [year, month] = asOfMonth.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}
