import { getBavariaHolidayName } from './bavariaHolidays'

/**
 * Arbeitstage für Urlaub und Abwesenheiten.
 *
 * Ein gesetzlicher Feiertag ist ohnehin frei – er darf weder als Urlaubstag
 * gezählt noch vom Urlaubskonto abgezogen werden. Deshalb fallen hier neben
 * Samstag und Sonntag auch die bayerischen Feiertage heraus.
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
