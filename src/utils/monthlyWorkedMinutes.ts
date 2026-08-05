import type { TimeEntry } from '../types'
import { applyWorkTimeRules, type WorkTimeRowInput } from '../components/admin/tabs/reports/workTimeRules'
import { convertToDate, entryCreditMinutes, formatTimeForInput } from '../components/admin/tabs/reports/reportUtils'
import { formatDateForInputLocal } from './dateUtils'
import { roundTimeToStep } from './timeRounding'

/**
 * Im Monat geleistete Arbeitszeit in Minuten.
 *
 * Bewusst über dieselben Bausteine wie der Zeiterfassungsbericht gerechnet –
 * 15-Minuten-Raster und 10-Std-Deckel. Sonst sähe der Mitarbeiter eine andere
 * Zahl als das Lohnbüro, und beide würden über dieselben Stunden streiten.
 *
 * Die gesetzliche Pause kürzt die Arbeitszeit dabei NICHT: sie wird auf die
 * ausgewiesene Anwesenheit draufgerechnet (siehe workTimeRules.ts). Wer
 * faktisch durcharbeitet, verliert die Stunden also nicht.
 *
 * Urlaub, Feiertag und Krankheit zählen nicht mit: gefragt ist geleistete
 * Arbeit, nicht bezahlte Abwesenheit. Laufende Stempelungen ohne Gehen-Zeit
 * bleiben ebenfalls außen vor.
 */
export const workedMinutesForMonth = (entries: TimeEntry[], monthKey: string): number => {
  const orderByDate = new Map<string, number>()
  const rows: WorkTimeRowInput[] = []

  for (const entry of entries) {
    if (entry.isVacationDay) continue
    const clockIn = convertToDate(entry.clockInTime)
    const clockOut = convertToDate(entry.clockOutTime)
    if (!clockIn || !clockOut) continue

    const dateKey = formatDateForInputLocal(clockIn)
    if (dateKey.slice(0, 7) !== monthKey) continue

    const order = orderByDate.get(dateKey) || 0
    orderByDate.set(dateKey, order + 1)

    rows.push({
      id: entry.id || `${dateKey}-${order}`,
      dateKey,
      order,
      clockIn: formatTimeForInput(roundTimeToStep(clockIn)),
      clockOut: formatTimeForInput(roundTimeToStep(clockOut)),
      pauseMinutes: Math.round((Number(entry.pauseTotalTime) || 0) / 60000),
      creditMinutes: entryCreditMinutes(entry),
      isFixed: false
    })
  }

  if (rows.length === 0) return 0

  const result = applyWorkTimeRules(rows, { regularDayMinutes: null })
  return result.days.reduce((sum, day) => sum + day.legalWorkMinutes, 0)
}
