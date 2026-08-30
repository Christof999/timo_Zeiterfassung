import { describe, it, expect } from 'vitest'
import {
  countLeaveWorkingDays,
  effectiveLeaveWorkingDays,
  isLeaveWorkingDay,
  leaveWorkingDayKeys,
  leaveWorkingDaysInYear
} from './workingDays'
import { leaveMinutesForRange, regularMinutesForRange } from './regularWorkTime'

// Bayerische Werktags-Feiertage 2026:
// 01.01. Do Neujahr · 06.01. Di Heilige Drei Könige · 03.04. Fr Karfreitag
// 06.04. Mo Ostermontag · 01.05. Fr Tag der Arbeit · 14.05. Do Christi Himmelfahrt
// 25.05. Mo Pfingstmontag · 04.06. Do Fronleichnam · 25.12. Fr 1. Weihnachtsfeiertag
const d = (iso: string) => new Date(`${iso}T12:00:00`)

describe('Arbeitstage für Urlaub', () => {
  it('zählt Wochenenden nicht', () => {
    expect(isLeaveWorkingDay(d('2026-03-07'))).toBe(false) // Samstag
    expect(isLeaveWorkingDay(d('2026-03-08'))).toBe(false) // Sonntag
    expect(isLeaveWorkingDay(d('2026-03-02'))).toBe(true) // Montag
  })

  it('zählt gesetzliche Feiertage nicht als Urlaubstag', () => {
    expect(isLeaveWorkingDay(d('2026-05-01'))).toBe(false) // Tag der Arbeit, Freitag
    expect(isLeaveWorkingDay(d('2026-04-06'))).toBe(false) // Ostermontag
    expect(isLeaveWorkingDay(d('2026-12-25'))).toBe(false) // 1. Weihnachtsfeiertag
  })

  it('kostet für einen einzelnen Feiertag keinen Urlaubstag', () => {
    expect(countLeaveWorkingDays(d('2026-05-01'), d('2026-05-01'))).toBe(0)
  })

  it('zieht den Feiertag aus einer vollen Urlaubswoche ab', () => {
    // Osterwoche Mo 06.04. bis Fr 10.04.: Ostermontag ist frei -> 4 statt 5 Tage
    expect(countLeaveWorkingDays(d('2026-04-06'), d('2026-04-10'))).toBe(4)
  })

  it('zählt eine Woche ohne Feiertage voll', () => {
    expect(countLeaveWorkingDays(d('2026-03-02'), d('2026-03-08'))).toBe(5)
  })

  it('zählt den gemeldeten Nachtragsfall 24.08. als einen Tag', () => {
    expect(countLeaveWorkingDays(d('2026-08-24'), d('2026-08-24'))).toBe(1)
  })

  it('ergibt 0 für einen Zeitraum, der nur aus Wochenende und Feiertag besteht', () => {
    // Karfreitag 03.04. bis Ostermontag 06.04.2026
    expect(countLeaveWorkingDays(d('2026-04-03'), d('2026-04-06'))).toBe(0)
  })
})

describe('Überstunden-Abzug bei „Urlaub auf Überstunden“', () => {
  it('belastet einen Feiertag nicht', () => {
    expect(leaveMinutesForRange(d('2026-05-01'), d('2026-05-01'))).toBe(0)
  })

  it('rechnet die Osterwoche ohne den Ostermontag ab', () => {
    // Di–Do je 8 Std + Fr 6 Std = 30 Std; der Ostermontag fällt raus
    expect(leaveMinutesForRange(d('2026-04-06'), d('2026-04-10'))).toBe(30 * 60)
  })

  it('weicht von der reinen Wochentags-Rechnung genau um den Feiertag ab', () => {
    const start = d('2026-04-06')
    const end = d('2026-04-10')
    // regularMinutesForRange kennt keine Feiertage: 38 Std statt 30 Std
    expect(regularMinutesForRange(start, end)).toBe(38 * 60)
    expect(regularMinutesForRange(start, end) - leaveMinutesForRange(start, end)).toBe(8 * 60)
  })

  it('bleibt bei einer Woche ohne Feiertage bei 38 Std', () => {
    expect(leaveMinutesForRange(d('2026-03-02'), d('2026-03-08'))).toBe(38 * 60)
  })
})

describe('Abgeleitete Tage eines Antrags (gilt auch für Bestandsdaten)', () => {
  it('ignoriert ein zu hoch gespeichertes workingDays-Feld', () => {
    // So liegt ein Altbestand in Firestore: 5 Tage gespeichert, obwohl der
    // Ostermontag mit drinsteckt.
    const alt = { startDate: '2026-04-06', endDate: '2026-04-10', workingDays: 5 }
    expect(effectiveLeaveWorkingDays(alt)).toBe(4)
  })

  it('zieht stornierte Tage zusätzlich ab', () => {
    const request = {
      startDate: '2026-04-06',
      endDate: '2026-04-10',
      cancelledDates: ['2026-04-07']
    }
    expect(effectiveLeaveWorkingDays(request)).toBe(3)
  })

  it('verträgt Firestore-Timestamps', () => {
    const request = {
      startDate: { toDate: () => new Date(2026, 4, 1, 12) }, // 01.05. Feiertag
      endDate: { toDate: () => new Date(2026, 4, 1, 12) }
    }
    expect(effectiveLeaveWorkingDays(request)).toBe(0)
  })

  it('liefert die Tage als Datums-Schlüssel', () => {
    expect(leaveWorkingDayKeys({ startDate: '2026-04-06', endDate: '2026-04-08' })).toEqual([
      '2026-04-07',
      '2026-04-08'
    ])
  })

  it('grenzt einen Jahreswechsel-Urlaub aufs Jahr ab', () => {
    // 28.12.2026 (Mo) bis 06.01.2027 (Mi).
    // 2026: 28.–31.12. = 4 Tage (der 25.12. liegt vor dem Zeitraum).
    // 2027: 01.01. Neujahr (Fr) und 06.01. Heilige Drei Koenige (Mi) fallen
    // als Feiertage weg, 02./03.01. ist Wochenende -> bleiben 04. und 05.01.
    const request = { startDate: '2026-12-28', endDate: '2027-01-06' }
    expect(leaveWorkingDaysInYear(request, 2026)).toBe(4)
    expect(leaveWorkingDaysInYear(request, 2027)).toBe(2)
  })

  it('gibt 0 bei fehlenden Daten', () => {
    expect(effectiveLeaveWorkingDays({})).toBe(0)
    expect(effectiveLeaveWorkingDays({ startDate: '2026-04-10', endDate: '2026-04-06' })).toBe(0)
  })
})
