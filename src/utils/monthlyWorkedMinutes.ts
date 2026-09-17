import type { TimeEntry } from '../types'
import { applyWorkTimeRules, type WorkTimeRowInput } from '../components/admin/tabs/reports/workTimeRules'
import { convertToDate, entryCreditMinutes, formatTimeForInput } from '../components/admin/tabs/reports/reportUtils'
import { formatDateForInputLocal } from './dateUtils'
import { roundTimeToStep } from './timeRounding'

/**
 * Berichtszeilen aus abgeschlossenen Stempelsätzen – die gemeinsame Basis für
 * Monats- und Tagessummen.
 *
 * `keepDateKey` entscheidet, welche Kalendertage einfließen. Urlaub und noch
 * offene Stempelungen fallen grundsätzlich heraus.
 */
const buildWorkTimeRows = (
  entries: TimeEntry[],
  keepDateKey: (dateKey: string) => boolean
): WorkTimeRowInput[] => {
  const orderByDate = new Map<string, number>()
  const rows: WorkTimeRowInput[] = []

  for (const entry of entries) {
    if (entry.isVacationDay) continue
    const clockIn = convertToDate(entry.clockInTime)
    const clockOut = convertToDate(entry.clockOutTime)
    if (!clockIn || !clockOut) continue

    const dateKey = formatDateForInputLocal(clockIn)
    if (!keepDateKey(dateKey)) continue

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

  return rows
}

/** Summe der gesetzlich anrechenbaren Arbeitszeit der übergebenen Zeilen. */
const legalWorkMinutes = (rows: WorkTimeRowInput[]): number => {
  if (rows.length === 0) return 0
  const result = applyWorkTimeRules(rows, { regularDayMinutes: null })
  return result.days.reduce((sum, day) => sum + day.legalWorkMinutes, 0)
}

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
 * Aus dem Überstundenkonto aufgefüllte Minuten zählen mit (sie stecken in
 * `entryCreditMinutes`): sie wurden dem Konto entnommen und sollen im Monat
 * abgerechnet werden können. Urlaub, Feiertag und Krankheit zählen dagegen
 * nicht mit – gefragt ist geleistete Arbeit, nicht bezahlte Abwesenheit.
 * Laufende Stempelungen ohne Gehen-Zeit bleiben ebenfalls außen vor.
 */
export const workedMinutesForMonth = (entries: TimeEntry[], monthKey: string): number =>
  legalWorkMinutes(buildWorkTimeRows(entries, (dateKey) => dateKey.slice(0, 7) === monthKey))

/**
 * An einem Kalendertag ("YYYY-MM-DD") geleistete Arbeitszeit in Minuten –
 * dieselbe Rechnung wie im Monat, nur auf einen Tag eingegrenzt.
 *
 * Grundlage für „Tag mit Überstunden auffüllen": bereits gebuchte
 * Auffüllungen sind enthalten, damit ein Tag nicht zweimal aufgefüllt wird.
 */
export const workedMinutesForDay = (entries: TimeEntry[], dateKey: string): number =>
  legalWorkMinutes(buildWorkTimeRows(entries, (key) => key === dateKey))
