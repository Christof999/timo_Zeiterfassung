import { getBavariaHolidayName } from './bavariaHolidays'
import { formatDateForInputLocal } from './dateUtils'

/**
 * Arbeitstage für Urlaub und Abwesenheiten.
 *
 * Ein gesetzlicher Feiertag ist ohnehin frei – er darf weder als Urlaubstag
 * gezählt noch vom Urlaubs- oder Überstundenkonto abgezogen werden. Deshalb
 * fallen hier neben Samstag und Sonntag auch die bayerischen Feiertage heraus.
 *
 * Achtung, nicht zu verwechseln mit der Regelarbeitszeit im
 * Zeiterfassungsbericht: dort wird ein Feiertag sehr wohl mit den üblichen
 * Stunden vergütet (siehe `regularMinutesForDate`). Frei heißt nicht unbezahlt.
 */
export const isLeaveWorkingDay = (date: Date): boolean => {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  return !getBavariaHolidayName(date)
}

/**
 * Arbeitstage im Zeitraum, beide Grenzen inklusive – ohne Wochenenden und
 * ohne gesetzliche Feiertage.
 */
export const countLeaveWorkingDays = (startDate: Date, endDate: Date): number => {
  const current = new Date(startDate)
  current.setHours(12, 0, 0, 0)
  const last = new Date(endDate)
  last.setHours(12, 0, 0, 0)

  let workingDays = 0
  while (current <= last) {
    if (isLeaveWorkingDay(current)) workingDays++
    current.setDate(current.getDate() + 1)
  }
  return workingDays
}

/**
 * Firestore-Timestamp, Date, Zahl oder String robust in ein Date wandeln.
 * Bewusst ohne Firebase-Import, damit diese Datei rein und testbar bleibt.
 */
export const toLeaveDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const candidate = value as { toDate?: () => Date; seconds?: number }
  if (typeof candidate.toDate === 'function') {
    const converted = candidate.toDate()
    return isNaN(converted.getTime()) ? null : converted
  }
  if (typeof candidate.seconds === 'number') return new Date(candidate.seconds * 1000)
  const parsed = new Date(value as string | number)
  return isNaN(parsed.getTime()) ? null : parsed
}

/** Das Nötigste eines Urlaubsantrags, um seine Tage zu bestimmen. */
export interface LeaveDayRange {
  startDate?: unknown
  endDate?: unknown
  /** Einzelne Tage, die wieder gutgeschrieben wurden (z.B. weil gestempelt wurde). */
  cancelledDates?: string[]
}

/**
 * Die tatsächlich verbrauchten Tage eines Antrags als Datums-Schlüssel.
 *
 * Bewusst aus dem Zeitraum abgeleitet und nicht aus dem gespeicherten Feld
 * `workingDays`: Altbestände wurden mit einer Zählung angelegt, die Feiertage
 * noch mitgezählt hat. Über die Ableitung stimmen auch alte Anträge, ohne dass
 * Daten migriert werden müssen.
 */
export const leaveWorkingDayKeys = (request: LeaveDayRange): string[] => {
  const start = toLeaveDate(request.startDate)
  const end = toLeaveDate(request.endDate)
  if (!start || !end) return []

  const cancelled = new Set(
    (request.cancelledDates || []).map((key) => String(key).slice(0, 10))
  )

  const current = new Date(start)
  current.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)
  if (last < current) return []

  const keys: string[] = []
  while (current <= last) {
    const key = formatDateForInputLocal(current)
    if (isLeaveWorkingDay(current) && !cancelled.has(key)) keys.push(key)
    current.setDate(current.getDate() + 1)
  }
  return keys
}

/**
 * Verbrauchte Arbeitstage eines Antrags – ohne Wochenenden, ohne Feiertage
 * und ohne bereits stornierte Tage. Gilt auch für Bestandsdaten.
 */
export const effectiveLeaveWorkingDays = (request: LeaveDayRange): number =>
  leaveWorkingDayKeys(request).length

/**
 * Verbrauchte Arbeitstage, begrenzt auf ein Kalenderjahr – Basis für das
 * Urlaubskonto eines Jahres.
 */
export const leaveWorkingDaysInYear = (request: LeaveDayRange, year: number): number =>
  leaveWorkingDayKeys(request).filter((key) => key.startsWith(`${year}-`)).length
