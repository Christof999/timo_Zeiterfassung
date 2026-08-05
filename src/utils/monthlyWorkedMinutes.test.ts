import { describe, it, expect } from 'vitest'
import { workedMinutesForMonth } from './monthlyWorkedMinutes'
import type { TimeEntry } from '../types'

const eintrag = (
  tag: number,
  von: [number, number],
  bis: [number, number],
  pauseMin = 0,
  extra: Partial<TimeEntry> = {}
): TimeEntry =>
  ({
    id: `e-${tag}-${von[0]}`,
    employeeId: 'mitarbeiter-1',
    projectId: 'projekt-a',
    clockInTime: new Date(2026, 6, tag, von[0], von[1]),
    clockOutTime: new Date(2026, 6, tag, bis[0], bis[1]),
    pauseTotalTime: pauseMin * 60 * 1000,
    ...extra
  }) as TimeEntry

describe('workedMinutesForMonth', () => {
  it('zählt eine einfache Schicht mit gestempelter Pause', () => {
    // 07:00–15:30 = 8:30 Anwesenheit, 30 Min Pause → 8:00
    expect(workedMinutesForMonth([eintrag(8, [7, 0], [15, 30], 30)], '2026-07')).toBe(8 * 60)
  })

  it('kürzt die Arbeitszeit NICHT um eine fehlende Pause', () => {
    // 07:00–15:00 ohne gestempelte Pause. Die gesetzliche Pause wird auf die
    // Anwesenheit draufgerechnet (Bericht zeigt 07:00–15:30 mit 30 Min Pause),
    // die geleistete Zeit bleibt 8:00 – siehe workTimeRules.ts. Wer faktisch
    // durcharbeitet, soll die Stunden nicht verlieren.
    expect(workedMinutesForMonth([eintrag(8, [7, 0], [15, 0], 0)], '2026-07')).toBe(8 * 60)
  })

  it('deckelt den Tag bei 10 Stunden', () => {
    // 06:00–19:00 = 13:00 Anwesenheit, ab 9 Std 45 Min Pause → 12:15, gedeckelt auf 10:00
    expect(workedMinutesForMonth([eintrag(8, [6, 0], [19, 0], 0)], '2026-07')).toBe(10 * 60)
  })

  it('fasst mehrere Stempelungen desselben Tages zusammen', () => {
    // Projektwechsel: 07:00–11:00 und 11:30–15:30 = zweimal 4:00 geleistet.
    // Die Lücke dazwischen ist keine Arbeitszeit und zählt nicht mit.
    const minuten = workedMinutesForMonth(
      [eintrag(8, [7, 0], [11, 0], 0), eintrag(8, [11, 30], [15, 30], 0)],
      '2026-07'
    )
    expect(minuten).toBe(8 * 60)
  })

  it('lässt Einträge anderer Monate außen vor', () => {
    const juni = eintrag(8, [7, 0], [15, 30], 30)
    juni.clockInTime = new Date(2026, 5, 8, 7, 0)
    juni.clockOutTime = new Date(2026, 5, 8, 15, 30)
    expect(workedMinutesForMonth([juni], '2026-07')).toBe(0)
  })

  it('ignoriert laufende Stempelungen ohne Gehen-Zeit', () => {
    const laufend = eintrag(8, [7, 0], [15, 30], 30)
    laufend.clockOutTime = null as any
    expect(workedMinutesForMonth([laufend], '2026-07')).toBe(0)
  })

  it('zählt Urlaubstage nicht als geleistete Arbeit', () => {
    const urlaub = eintrag(9, [7, 0], [15, 30], 30, { isVacationDay: true } as Partial<TimeEntry>)
    expect(workedMinutesForMonth([urlaub], '2026-07')).toBe(0)
  })

  it('summiert über mehrere Tage', () => {
    const tage = [8, 9, 10].map((t) => eintrag(t, [7, 0], [15, 30], 30))
    expect(workedMinutesForMonth(tage, '2026-07')).toBe(3 * 8 * 60)
  })

  it('gibt 0 zurück, wenn nichts vorliegt', () => {
    expect(workedMinutesForMonth([], '2026-07')).toBe(0)
  })
})
