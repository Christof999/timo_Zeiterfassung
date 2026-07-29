// Regelarbeitszeit nach Wochentag.
//
// Montag bis Donnerstag 8 Std, Freitag 6 Std — macht 38 Std/Woche. Dieselbe
// Staffel gilt für Urlaubs-, Feiertags- und Krankheitstage und als Schwelle,
// ab der Überstunden entstehen.

export const REGULAR_MINUTES_MON_THU = 8 * 60
export const REGULAR_MINUTES_FRI = 6 * 60

export interface RegularWorkTimeConfig {
  /** Regelarbeitszeit Montag–Donnerstag in Minuten */
  monThu: number
  /** Regelarbeitszeit Freitag in Minuten */
  fri: number
}

export const DEFAULT_REGULAR_WORK_TIME: RegularWorkTimeConfig = {
  monThu: REGULAR_MINUTES_MON_THU,
  fri: REGULAR_MINUTES_FRI
}

/** Regelarbeitszeit des Tages; Samstag und Sonntag zählen mit 0. */
export const regularMinutesForDate = (
  date: Date,
  config: RegularWorkTimeConfig = DEFAULT_REGULAR_WORK_TIME
): number => {
  const day = date.getDay()
  if (day === 0 || day === 6) return 0
  if (day === 5) return config.fri
  return config.monThu
}

/** Wie `regularMinutesForDate`, aber für einen Datums-Schlüssel "YYYY-MM-DD". */
export const regularMinutesForDateKey = (
  dateKey: string,
  config: RegularWorkTimeConfig = DEFAULT_REGULAR_WORK_TIME
): number => {
  const date = new Date(`${dateKey}T12:00:00`)
  if (isNaN(date.getTime())) return config.monThu
  return regularMinutesForDate(date, config)
}

/**
 * Regelarbeitszeit über einen Zeitraum (beide Grenzen inklusive). Basis für
 * „Urlaub auf Überstunden": ein Freitag kostet nur 6 Std vom Konto.
 */
export const regularMinutesForRange = (
  start: Date,
  end: Date,
  config: RegularWorkTimeConfig = DEFAULT_REGULAR_WORK_TIME
): number => {
  const current = new Date(start)
  current.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)
  let total = 0
  while (current <= last) {
    total += regularMinutesForDate(current, config)
    current.setDate(current.getDate() + 1)
  }
  return total
}
