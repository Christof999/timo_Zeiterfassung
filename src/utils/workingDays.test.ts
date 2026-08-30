import { describe, it, expect } from 'vitest'
import { countLeaveWorkingDays, isLeaveWorkingDay } from './workingDays'
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
