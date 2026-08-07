import { enumerateDays, minutesToHoursLabel, type AdjustedReportEntry } from './reportUtils'
import { formatDateForInputLocal } from '../../../../utils/dateUtils'

/**
 * Aufbereitung für den DATEV-Nachweis „Vorlage zur Dokumentation der täglichen
 * Arbeitszeit".
 *
 * Anders als der ausführliche Bericht hat das Formular genau **eine Zeile je
 * Kalendertag** – mehrere Stempelungen eines Tages (Projektwechsel) werden
 * deshalb zu Beginn/Ende/Pause/Dauer zusammengefasst. Projekt und
 * Dokumentation kommen bewusst nicht vor.
 */

/** Kürzel der DATEV-Vorlage für die mit „*" überschriebene Spalte. */
export type DatevKey = '' | 'K' | 'U' | 'UU' | 'F' | 'SA' | 'SU'

export const DATEV_KEY_LEGEND: Array<{ key: Exclude<DatevKey, ''>; label: string }> = [
  { key: 'K', label: 'Krank' },
  { key: 'U', label: 'Urlaub' },
  { key: 'UU', label: 'unbezahlter Urlaub' },
  { key: 'F', label: 'Feiertag' },
  { key: 'SA', label: 'Stundenweise abwesend' },
  { key: 'SU', label: 'Stundenweise Urlaub' }
]

export interface DatevDayRow {
  /** Kalendertag (1–31) */
  day: number
  dateKey: string
  /** früheste Kommen-Zeit des Tages, "" bei reiner Abwesenheit */
  begin: string
  /** späteste Gehen-Zeit des Tages */
  end: string
  pauseMinutes: number
  workMinutes: number
  key: DatevKey
  remark: string
}

const KEY_BY_ABSENCE: Record<string, DatevKey> = {
  sick: 'K',
  vacation: 'U',
  holiday: 'F'
}

const REMARK_BY_ABSENCE: Record<string, string> = {
  sick: 'Krank',
  vacation: 'Urlaub',
  holiday: 'Feiertag'
}

/** "07:00" → 420; ungültig → null. Für den frühesten/spätesten Zeitpunkt. */
const toMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * Eine Zeile je Kalendertag des Zeitraums – auch für Tage ohne Buchung, damit
 * das Formular wie die Vorlage lückenlos von 1 bis 31 durchläuft.
 */
export const buildDatevRows = (
  entries: AdjustedReportEntry[],
  startDate: string,
  endDate: string
): DatevDayRow[] => {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  const byDay = new Map<string, AdjustedReportEntry[]>()
  for (const entry of entries) {
    const list = byDay.get(entry.dateKey)
    if (list) list.push(entry)
    else byDay.set(entry.dateKey, [entry])
  }

  return enumerateDays(start, end).map((date) => {
    const dateKey = formatDateForInputLocal(date)
    const tagesEintraege = byDay.get(dateKey) || []

    let fruehester: number | null = null
    let spaetester: number | null = null
    let pauseMinutes = 0
    let workMinutes = 0
    let key: DatevKey = ''
    const bemerkungen: string[] = []

    for (const entry of tagesEintraege) {
      if (entry.absenceKind) {
        // Urlaub, Krankheit und Feiertag sind keine Arbeitszeit: Das Blatt
        // dokumentiert nach ArbZG die geleistete Arbeit, dafür gibt es die
        // Kürzel-Spalte. Die Dauer bleibt leer, damit die Summe unten der
        // gemeldeten Stundenzahl entspricht.
        key = KEY_BY_ABSENCE[entry.absenceKind] || key
        const label = REMARK_BY_ABSENCE[entry.absenceKind]
        if (label && !bemerkungen.includes(label)) bemerkungen.push(label)
        continue
      }

      workMinutes += entry.effectiveWorkMinutes
      pauseMinutes += entry.effectivePauseMinutes
      const beginn = toMinutes(entry.clockIn)
      const ende = toMinutes(entry.effectiveClockOut)
      if (beginn !== null) fruehester = fruehester === null ? beginn : Math.min(fruehester, beginn)
      if (ende !== null) spaetester = spaetester === null ? ende : Math.max(spaetester, ende)
    }

    const alsUhrzeit = (minuten: number | null): string =>
      minuten === null ? '' : minutesToHoursLabel(minuten).padStart(5, '0')

    return {
      day: date.getDate(),
      dateKey,
      begin: alsUhrzeit(fruehester),
      end: alsUhrzeit(spaetester),
      pauseMinutes,
      workMinutes,
      key,
      remark: bemerkungen.join(', ')
    }
  })
}

export const datevTotalMinutes = (rows: DatevDayRow[]): number =>
  rows.reduce((sum, row) => sum + row.workMinutes, 0)
