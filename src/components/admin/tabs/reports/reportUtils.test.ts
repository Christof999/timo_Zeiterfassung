import { describe, it, expect } from 'vitest'
import {
  calculateWorkHours,
  workMinutesFromParts,
  minutesToHoursLabel,
  formatHoursMinutes,
  escapeHtml,
  getWeekStart,
  getWeekEnd,
  enumerateDays,
  convertToDate,
  buildDateFromTimeInput,
  getReportRowChanges,
  buildAdjustedReport,
  type ReportEntry
} from './reportUtils'
import { roundTimeToStep } from '../../../../utils/timeRounding'
import type { TimeEntry } from '../../../../types'

describe('convertToDate – liest alle clockInTime-Formate', () => {
  // Regression: Die Zeitraumfilterung der Berichte läuft clientseitig über
  // convertToDate. Sie MUSS auch Alt-/Sonderformate lesen (Firestore-Timestamp
  // als toDate(), einfaches {seconds}-Objekt, ISO-String, Date), sonst fallen
  // Stempelungen aus Mitarbeiter-/Projektberichten heraus.
  const target = new Date(2026, 5, 15, 8, 30)

  it('liest ein Date direkt', () => {
    expect(convertToDate(target)?.getTime()).toBe(target.getTime())
  })

  it('liest ein Timestamp-artiges Objekt mit toDate()', () => {
    const tsLike = { toDate: () => target }
    expect(convertToDate(tsLike)?.getTime()).toBe(target.getTime())
  })

  it('liest ein einfaches {seconds}-Objekt (Alt-/Sonderdaten)', () => {
    const seconds = Math.floor(target.getTime() / 1000)
    const secondsObj = { seconds, nanoseconds: 0 }
    expect(convertToDate(secondsObj)?.getTime()).toBe(seconds * 1000)
  })

  it('liest einen ISO-String', () => {
    expect(convertToDate('2026-06-15T08:30:00')?.getFullYear()).toBe(2026)
  })

  it('gibt null bei fehlendem/ungültigem Wert', () => {
    expect(convertToDate(null)).toBeNull()
    expect(convertToDate(undefined)).toBeNull()
    expect(convertToDate('kein-datum')).toBeNull()
  })
})

describe('calculateWorkHours', () => {
  it('berechnet normale Arbeitszeit mit Pause', () => {
    expect(calculateWorkHours('08:00', '16:30', 30)).toBe('8:00')
  })

  it('erkennt Stempelung über Mitternacht', () => {
    expect(calculateWorkHours('22:00', '02:00', 0)).toBe('4:00')
  })

  it('interpretiert Pause > Anwesenheit NICHT als Nachtschicht', () => {
    // 10 Min Anwesenheit, 30 Min Pause → 0:00 (nicht 23:40)
    expect(calculateWorkHours('08:00', '08:10', 30)).toBe('0:00')
  })

  it('liefert - bei fehlenden Zeiten', () => {
    expect(calculateWorkHours('', '16:00', 0)).toBe('-')
    expect(calculateWorkHours('08:00', '', 0)).toBe('-')
  })
})

describe('workMinutesFromParts', () => {
  it('berechnet Minuten inkl. Mitternachts-Erkennung', () => {
    expect(workMinutesFromParts('08:00', '16:00', 60)).toBe(7 * 60)
    expect(workMinutesFromParts('23:00', '01:00', 0)).toBe(120)
    expect(workMinutesFromParts('08:00', '08:10', 30)).toBe(0)
  })
})

describe('Formatierung', () => {
  it('minutesToHoursLabel', () => {
    expect(minutesToHoursLabel(495)).toBe('8:15')
    expect(minutesToHoursLabel(0)).toBe('0:00')
  })

  it('formatHoursMinutes', () => {
    expect(formatHoursMinutes(7.83)).toBe('7 Std 50 Min')
    expect(formatHoursMinutes(0)).toBe('0 Std 0 Min')
  })

  it('escapeHtml', () => {
    expect(escapeHtml('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;')
  })
})

describe('Wochen-Helfer', () => {
  it('getWeekStart liefert Montag, getWeekEnd Sonntag', () => {
    // 2026-07-08 ist ein Mittwoch
    const wed = new Date(2026, 6, 8)
    expect(getWeekStart(wed).getDay()).toBe(1)
    expect(getWeekStart(wed).getDate()).toBe(6)
    expect(getWeekEnd(wed).getDay()).toBe(0)
    expect(getWeekEnd(wed).getDate()).toBe(12)
  })

  it('enumerateDays zählt beide Grenzen mit', () => {
    const days = enumerateDays(new Date(2026, 6, 6), new Date(2026, 6, 12))
    expect(days).toHaveLength(7)
  })
})

describe('buildDateFromTimeInput – Uhrzeit auf den Tag des Stempelsatzes legen', () => {
  const base = new Date(2026, 6, 8, 6, 17, 43, 500)

  it('setzt Stunde/Minute und nullt Sekunden', () => {
    const result = buildDateFromTimeInput(base, '07:45')
    expect(result?.getFullYear()).toBe(2026)
    expect(result?.getMonth()).toBe(6)
    expect(result?.getDate()).toBe(8)
    expect(result?.getHours()).toBe(7)
    expect(result?.getMinutes()).toBe(45)
    expect(result?.getSeconds()).toBe(0)
    expect(result?.getMilliseconds()).toBe(0)
  })

  it('lässt das Ausgangsdatum unverändert', () => {
    const before = base.getTime()
    buildDateFromTimeInput(base, '07:45')
    expect(base.getTime()).toBe(before)
  })

  it('gibt null bei leerer oder unsinniger Eingabe', () => {
    expect(buildDateFromTimeInput(base, '')).toBeNull()
    expect(buildDateFromTimeInput(base, 'abc')).toBeNull()
    expect(buildDateFromTimeInput(base, '25:00')).toBeNull()
    expect(buildDateFromTimeInput(base, '07:99')).toBeNull()
  })
})

describe('getReportRowChanges – nur echte Abweichungen speichern', () => {
  // Die Direkt-Speicherung im Zeiterfassungsbericht darf ausschließlich
  // Felder schreiben, die der Admin wirklich verändert hat. Sonst würden die
  // ungeglätteten Rohzeiten still auf das 15-Minuten-Raster überschrieben.
  const original: TimeEntry = {
    id: 'e1',
    employeeId: 'mitarbeiter-1',
    projectId: 'projekt-a',
    // 07:07 wird in der Anzeige auf 07:00 geglättet
    clockInTime: new Date(2026, 6, 8, 7, 7),
    // 16:05 wird in der Anzeige auf 16:00 geglättet
    clockOutTime: new Date(2026, 6, 8, 16, 5),
    pauseTotalTime: 30 * 60 * 1000
  }

  const row = (overrides: Partial<ReportEntry> = {}): ReportEntry => ({
    id: 'e1',
    originalEntry: original,
    source: 'time-entry',
    date: 'Mi., 08.07.2026',
    dateRaw: new Date(2026, 6, 8),
    dateKey: '2026-07-08',
    projectId: 'projekt-a',
    projectName: 'Projekt A',
    clockIn: '07:00',
    clockOut: '16:00',
    pauseMinutes: 30,
    pauseMs: 30 * 60 * 1000,
    workHours: '8:30',
    notes: '',
    originalNotes: '',
    isEdited: false,
    ...overrides
  })

  it('meldet keine Änderung für die unveränderte (geglättete) Zeile', () => {
    const changes = getReportRowChanges(row(), roundTimeToStep)
    expect(changes.any).toBe(false)
    expect(changes.originalClockIn).toBe('07:00')
    expect(changes.originalClockOut).toBe('16:00')
  })

  it('erkennt eine geänderte Kommen-Zeit isoliert', () => {
    const changes = getReportRowChanges(row({ clockIn: '08:00' }), roundTimeToStep)
    expect(changes).toMatchObject({ clockIn: true, clockOut: false, pause: false, project: false })
    expect(changes.any).toBe(true)
  })

  it('erkennt eine geänderte Pause isoliert', () => {
    const changes = getReportRowChanges(row({ pauseMinutes: 45 }), roundTimeToStep)
    expect(changes).toMatchObject({ clockIn: false, clockOut: false, pause: true, project: false })
  })

  it('erkennt einen Projektwechsel', () => {
    const changes = getReportRowChanges(row({ projectId: 'projekt-b' }), roundTimeToStep)
    expect(changes).toMatchObject({ project: true, clockIn: false, clockOut: false, pause: false })
  })

  it('wertet ein leeres Projektfeld nicht als Projektwechsel', () => {
    const changes = getReportRowChanges(row({ projectId: '' }), roundTimeToStep)
    expect(changes.project).toBe(false)
  })

  it('erkennt das Nachtragen einer Gehen-Zeit bei laufendem Stempelsatz', () => {
    const running: TimeEntry = { ...original, clockOutTime: null }
    const changes = getReportRowChanges(
      row({ originalEntry: running, clockOut: '16:00' }),
      roundTimeToStep
    )
    expect(changes.originalClockOut).toBe('')
    expect(changes.clockOut).toBe(true)
  })
})

describe('buildAdjustedReport – Korrektur bleibt außerhalb der Datenbank', () => {
  const original: TimeEntry = {
    id: 'e1',
    employeeId: 'mitarbeiter-1',
    projectId: 'projekt-a',
    clockInTime: new Date(2026, 6, 8, 7, 0),
    clockOutTime: new Date(2026, 6, 8, 16, 0),
    // Der Klassiker: 0 Minuten Pause gestempelt.
    pauseTotalTime: 0
  }

  const row = (overrides: Partial<ReportEntry> = {}): ReportEntry => ({
    id: 'e1',
    originalEntry: original,
    source: 'time-entry',
    date: 'Mi., 08.07.2026',
    dateRaw: new Date(2026, 6, 8),
    dateKey: '2026-07-08',
    projectId: 'projekt-a',
    projectName: 'Projekt A',
    clockIn: '07:00',
    clockOut: '16:00',
    pauseMinutes: 0,
    pauseMs: 0,
    workHours: '9:00',
    notes: '',
    originalNotes: '',
    isEdited: false,
    ...overrides
  })

  it('weist die gesetzliche Pause aus, ohne die Zeile zu verändern', () => {
    const entries = [row()]
    const report = buildAdjustedReport(entries)
    const adjusted = report.entries[0]

    expect(adjusted.effectivePauseMinutes).toBe(45)
    expect(adjusted.effectiveWorkHours).toBe('8:15')
    // Die Originalfelder – und nur die werden gespeichert – bleiben unberührt.
    expect(adjusted.pauseMinutes).toBe(0)
    expect(adjusted.clockOut).toBe('16:00')
    expect(entries[0].pauseMinutes).toBe(0)
  })

  it('löst durch die Automatik keinen Speicher-Zustand aus', () => {
    // Kernzusage an den Kunden: die automatische Korrektur darf niemals als
    // zu speichernde Änderung gelten, sonst landet sie in Firestore.
    const report = buildAdjustedReport([row()], {
      regularDayMinutes: 510,
      requestedPayoutMinutes: 60
    })
    const adjusted = report.entries[0]

    expect(adjusted.effectiveWorkHours).not.toBe(adjusted.workHours)
    const changes = getReportRowChanges(adjusted, roundTimeToStep)
    expect(changes.any).toBe(false)
  })

  it('lässt eine echte Admin-Änderung weiterhin als speicherbar durch', () => {
    const report = buildAdjustedReport([row({ pauseMinutes: 60, isEdited: true })])
    const changes = getReportRowChanges(report.entries[0], roundTimeToStep)
    expect(changes.pause).toBe(true)
    expect(changes.any).toBe(true)
  })
})
