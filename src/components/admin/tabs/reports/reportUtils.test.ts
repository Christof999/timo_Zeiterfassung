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
  convertToDate
} from './reportUtils'

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
