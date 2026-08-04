/** Monatsschlüssel und -beschriftungen für die Überstunden-Verrechnung. */

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
]

/** Datum → "2026-03". Bewusst lokal gerechnet, nicht über toISOString (UTC-Versatz). */
export const monthKeyForDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** Der Monat, in dem gerade gearbeitet wird. */
export const currentMonthKey = (): string => monthKeyForDate(new Date())

/**
 * Der Vormonat – das ist der Monat, der abgerechnet wird. Anfang August wird
 * der Juli gemeldet, nicht der laufende August.
 */
export const previousMonthKey = (from: Date = new Date()): string =>
  monthKeyForDate(new Date(from.getFullYear(), from.getMonth() - 1, 1))

/** Die Monate, für die noch eingetragen werden darf: Vormonat und laufender Monat. */
export const settleableMonthKeys = (from: Date = new Date()): string[] => [
  previousMonthKey(from),
  monthKeyForDate(from)
]

/** "2026-03" → "März 2026". Unbekanntes Format bleibt unverändert. */
export const monthKeyLabel = (monthKey: string): string => {
  const [year, month] = (monthKey || '').split('-')
  const index = Number(month) - 1
  if (!year || !MONTH_NAMES[index]) return monthKey
  return `${MONTH_NAMES[index]} ${year}`
}

/**
 * Monatsschlüssel eines Auswertungszeitraums – aber nur, wenn Start und Ende
 * im selben Kalendermonat liegen. Sonst gibt es keinen eindeutigen Monat, dem
 * eine Verrechnung zugeordnet werden könnte.
 */
export const monthKeyForPeriod = (startDate: string, endDate: string): string | null => {
  if (!startDate || !endDate) return null
  const start = startDate.slice(0, 7)
  const end = endDate.slice(0, 7)
  return start === end ? start : null
}
