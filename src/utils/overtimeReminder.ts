import { getBavariaHolidayName } from './bavariaHolidays'
import { monthKeyForDate } from './overtimeMonth'

/**
 * Erinnerung an die Überstunden-Verrechnung zum Monatsende.
 *
 * Angesetzt wird der letzte *Arbeitstag* des Monats, nicht der letzte
 * Kalendertag: fällt der Monatsletzte auf ein Wochenende oder einen Feiertag,
 * öffnet niemand die App und die Erinnerung liefe ins Leere. Ab diesem Tag
 * bleibt der Hinweis bis zum Monatsende stehen.
 */

/** Letzter Arbeitstag (Mo–Fr, kein bayerischer Feiertag) des Monats von `date`. */
export const lastWorkingDayOfMonth = (date: Date): Date => {
  const month = date.getMonth()
  // Tag 0 des Folgemonats = letzter Tag dieses Monats.
  const candidate = new Date(date.getFullYear(), month + 1, 0)

  while (candidate.getMonth() === month) {
    const weekday = candidate.getDay()
    const isWeekend = weekday === 0 || weekday === 6
    if (!isWeekend && !getBavariaHolidayName(candidate)) return candidate
    candidate.setDate(candidate.getDate() - 1)
  }

  // Theoretischer Fall ohne einen einzigen Arbeitstag: letzter Kalendertag.
  return new Date(date.getFullYear(), month + 1, 0)
}

/** Ist `date` der letzte Arbeitstag des Monats oder einer der Tage danach? */
export const isOvertimeReminderDay = (date: Date): boolean =>
  date.getDate() >= lastWorkingDayOfMonth(date).getDate()

export interface OvertimeReminderInput {
  today: Date
  /** Existiert für den laufenden Monat bereits ein Eintrag? */
  hasSettlementForMonth: boolean
  /** Überstundenkonto in Minuten */
  balanceMinutes: number
  /** Monat, für den der Hinweis bereits weggeklickt wurde ("YYYY-MM") */
  dismissedMonth: string | null
}

/**
 * Der Hinweis erscheint nur, wenn er etwas bewirken kann: es gibt Überstunden,
 * der Mitarbeiter hat für den Monat noch nichts eingetragen und den Hinweis
 * diesen Monat noch nicht weggeklickt.
 */
export const shouldShowOvertimeReminder = ({
  today,
  hasSettlementForMonth,
  balanceMinutes,
  dismissedMonth
}: OvertimeReminderInput): boolean => {
  if (hasSettlementForMonth) return false
  if (!(balanceMinutes > 0)) return false
  if (dismissedMonth === monthKeyForDate(today)) return false
  return isOvertimeReminderDay(today)
}

/**
 * Der Admin kann die Erinnerung zusätzlich von Hand auslösen. Sie sticht die
 * Tagesregel: gefragt ist dann jeder, unabhängig vom Datum. Ein früher
 * weggeklickter Hinweis blockiert einen neuen Aufruf nicht – sonst könnte der
 * Admin niemanden mehr erreichen, der schon einmal weggeklickt hat.
 */
export const shouldShowBroadcastReminder = ({
  broadcastAt,
  hasSettlementForMonth,
  dismissedBroadcastAt
}: {
  /** Zeitpunkt des Admin-Aufrufs, null = kein Aufruf */
  broadcastAt: Date | null
  hasSettlementForMonth: boolean
  /** Zuletzt weggeklickter Aufruf (ms seit Epoch) */
  dismissedBroadcastAt: number | null
}): boolean => {
  if (!broadcastAt) return false
  if (hasSettlementForMonth) return false
  if (dismissedBroadcastAt !== null && broadcastAt.getTime() <= dismissedBroadcastAt) return false
  return true
}

/** localStorage-Schlüssel je Mitarbeiter; gespeichert wird der weggeklickte Monat. */
export const overtimeReminderDismissKey = (employeeId: string): string =>
  `overtimeReminderDismissed:${employeeId}`

/** localStorage-Schlüssel für den zuletzt weggeklickten Admin-Aufruf. */
export const broadcastDismissKey = (employeeId: string): string =>
  `overtimeBroadcastDismissed:${employeeId}`

export const readDismissedBroadcastAt = (employeeId: string): number | null => {
  try {
    const raw = localStorage.getItem(broadcastDismissKey(employeeId))
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const writeDismissedBroadcastAt = (employeeId: string, timestamp: number): void => {
  try {
    localStorage.setItem(broadcastDismissKey(employeeId), String(timestamp))
  } catch {
    // Kein localStorage – dann erscheint der Hinweis erneut.
  }
}

export const readDismissedMonth = (employeeId: string): string | null => {
  try {
    return localStorage.getItem(overtimeReminderDismissKey(employeeId))
  } catch {
    return null
  }
}

export const writeDismissedMonth = (employeeId: string, month: string): void => {
  try {
    localStorage.setItem(overtimeReminderDismissKey(employeeId), month)
  } catch {
    // Kein localStorage (privater Modus) – dann erscheint der Hinweis erneut.
  }
}
