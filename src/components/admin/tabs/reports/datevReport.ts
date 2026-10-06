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
 *
 * Abwesenheitstage (Urlaub, Krank, Feiertag, Berufsschule) stehen mit ihrer
 * Regelarbeitszeit in der Dauer und in der Summe – das Blatt weist damit die
 * bezahlten Stunden des Monats aus, nicht nur die gestempelten. Woher die
 * Stunden kommen, sagt das Kürzel in der "*"-Spalte.
 */

/**
 * Raster, auf das krumme Dauern im Nachweis abgerundet werden:
 * 6 Minuten = 0,10 Dezimalstunden.
 */
export const DATEV_DURATION_STEP_MINUTES = 6

/** Viertelstunden sind in Dezimalstunden bereits glatt (0,25 / 0,50 / 0,75). */
const QUARTER_HOUR_MINUTES = 15

/**
 * Tagesdauer für den Nachweis glattziehen.
 *
 * Die Lohnbuchhaltung liest Dezimalstunden. Stempelzeiten liegen auf
 * Viertelstunden, die Fahrtzeit-Gutschrift von 10 Minuten macht daraus aber
 * 8:10 = „8,17" oder 7:25 = „7,42". Solche Werte werden auf die volle
 * Zehntelstunde ABGERUNDET – 8,10 und 7,40 (Wunsch des Kunden, nach einem
 * ersten Versuch mit 0,05er-Schritten). Viertelstunden bleiben, wie sie sind:
 * 8,25 soll nicht zu 8,20 werden.
 */
export const roundDatevDuration = (minutes: number): number =>
  minutes % QUARTER_HOUR_MINUTES === 0
    ? minutes
    : Math.floor(minutes / DATEV_DURATION_STEP_MINUTES) * DATEV_DURATION_STEP_MINUTES

/** Kürzel der DATEV-Vorlage für die mit „*" überschriebene Spalte. */
export type DatevKey = '' | 'K' | 'U' | 'UU' | 'F' | 'SA' | 'SU' | 'S'

export const DATEV_KEY_LEGEND: Array<{ key: Exclude<DatevKey, ''>; label: string }> = [
  { key: 'K', label: 'Krank' },
  { key: 'U', label: 'Urlaub' },
  { key: 'UU', label: 'unbezahlter Urlaub' },
  { key: 'F', label: 'Feiertag' },
  { key: 'SA', label: 'Stundenweise abwesend' },
  { key: 'SU', label: 'Stundenweise Urlaub' },
  // Nicht Teil der DATEV-Vorlage, aber von der Lohnbuchhaltung ausdrücklich
  // gewünscht: bei Azubis soll erkennbar sein, warum nicht gearbeitet wurde.
  { key: 'S', label: 'Berufsschule' }
]

export interface DatevDayRow {
  /** Kalendertag (1–31) */
  day: number
  dateKey: string
  /** früheste Kommen-Zeit des Tages, "" bei reiner Abwesenheit */
  begin: string
  /** späteste Gehen-Zeit des Tages */
  end: string
  /** Pause, für den Nachweis glattgezogen */
  pauseMinutes: number
  /** Dauer, für den Nachweis glattgezogen (siehe roundDatevDuration) */
  workMinutes: number
  /** Dauer minutengenau – daraus entsteht die Summe */
  exactWorkMinutes: number
  key: DatevKey
  remark: string
}

const KEY_BY_ABSENCE: Record<string, DatevKey> = {
  sick: 'K',
  vacation: 'U',
  holiday: 'F',
  school: 'S'
}

const REMARK_BY_ABSENCE: Record<string, string> = {
  sick: 'Krank',
  vacation: 'Urlaub',
  holiday: 'Feiertag',
  school: 'Berufsschule'
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
    /** Regelstunden eines Abwesenheitstags – zählen nur, wenn nicht gestempelt wurde. */
    let absenceMinutes = 0
    let key: DatevKey = ''
    const bemerkungen: string[] = []

    for (const entry of tagesEintraege) {
      if (entry.absenceKind) {
        // Urlaub, Krankheit, Feiertag und Berufsschule sind bezahlte Tage: die
        // Regelarbeitszeit (Mo–Do 8 Std, Fr 6 Std) steht in der Dauer und zählt
        // in die Summe. Das Kürzel in der "*"-Spalte sagt weiterhin, warum an
        // dem Tag nicht gestempelt wurde. Beginn und Ende bleiben leer – es
        // gibt keine Kommen-/Gehen-Zeit.
        key = KEY_BY_ABSENCE[entry.absenceKind] || key
        const label = REMARK_BY_ABSENCE[entry.absenceKind]
        if (label && !bemerkungen.includes(label)) bemerkungen.push(label)
        absenceMinutes = Math.max(absenceMinutes, entry.effectiveWorkMinutes)
        continue
      }

      workMinutes += entry.effectiveWorkMinutes
      pauseMinutes += entry.effectivePauseMinutes
      const beginn = toMinutes(entry.clockIn)
      const ende = toMinutes(entry.effectiveClockOut)
      if (beginn !== null) fruehester = fruehester === null ? beginn : Math.min(fruehester, beginn)
      if (ende !== null) spaetester = spaetester === null ? ende : Math.max(spaetester, ende)
    }

    // Ein Tag ist entweder gearbeitet oder abwesend. Falls doch beides
    // vorliegt (z.B. halber Tag gestempelt), gewinnt die echte Arbeitszeit –
    // sonst stünden auf einem Tag 8 Std Urlaub plus die gestempelten Stunden.
    if (workMinutes === 0) workMinutes = absenceMinutes

    const alsUhrzeit = (minuten: number | null): string =>
      minuten === null ? '' : minutesToHoursLabel(minuten).padStart(5, '0')

    return {
      day: date.getDate(),
      dateKey,
      begin: alsUhrzeit(fruehester),
      end: alsUhrzeit(spaetester),
      // Gerundet wird hier und nicht erst bei der Ausgabe: Ansicht, Ausdruck
      // und PDF zeigen dann garantiert dieselben Tageswerte.
      pauseMinutes: roundDatevDuration(pauseMinutes),
      workMinutes: roundDatevDuration(workMinutes),
      exactWorkMinutes: workMinutes,
      key,
      remark: bemerkungen.join(', ')
    }
  })
}

/**
 * Summe des Nachweises – aus den minutengenauen Tageswerten.
 *
 * Bewusst nicht aus den abgerundeten: über einen Monat fehlte sonst bis zu
 * einer halben Stunde, und die Summe muss zur Abrechnung darunter passen, die
 * mit den tatsächlichen Stunden rechnet.
 */
export const datevTotalMinutes = (rows: DatevDayRow[]): number =>
  rows.reduce((sum, row) => sum + row.exactWorkMinutes, 0)
