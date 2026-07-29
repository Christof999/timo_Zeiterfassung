import { describe, it, expect } from 'vitest'
import {
  REGULAR_MINUTES_FRI,
  REGULAR_MINUTES_MON_THU,
  regularMinutesForDate,
  regularMinutesForDateKey,
  regularMinutesForRange
} from './regularWorkTime'

// 2026-03-02 ist ein Montag.
const monday = new Date(2026, 2, 2, 12)
const thursday = new Date(2026, 2, 5, 12)
const friday = new Date(2026, 2, 6, 12)
const saturday = new Date(2026, 2, 7, 12)
const sunday = new Date(2026, 2, 8, 12)

describe('Regelarbeitszeit nach Wochentag', () => {
  it('gibt Montag bis Donnerstag 8 Std', () => {
    expect(regularMinutesForDate(monday)).toBe(REGULAR_MINUTES_MON_THU)
    expect(regularMinutesForDate(thursday)).toBe(REGULAR_MINUTES_MON_THU)
    expect(REGULAR_MINUTES_MON_THU).toBe(8 * 60)
  })

  it('gibt Freitag 6 Std', () => {
    expect(regularMinutesForDate(friday)).toBe(REGULAR_MINUTES_FRI)
    expect(REGULAR_MINUTES_FRI).toBe(6 * 60)
  })

  it('gibt am Wochenende 0', () => {
    expect(regularMinutesForDate(saturday)).toBe(0)
    expect(regularMinutesForDate(sunday)).toBe(0)
  })

  it('ergibt eine 38-Std-Woche', () => {
    expect(regularMinutesForRange(monday, sunday)).toBe(38 * 60)
  })

  it('arbeitet auch auf Datums-Schlüsseln', () => {
    expect(regularMinutesForDateKey('2026-03-02')).toBe(8 * 60)
    expect(regularMinutesForDateKey('2026-03-06')).toBe(6 * 60)
    expect(regularMinutesForDateKey('2026-03-07')).toBe(0)
  })

  it('lässt sich überschreiben', () => {
    const config = { monThu: 7 * 60, fri: 5 * 60 }
    expect(regularMinutesForDate(monday, config)).toBe(7 * 60)
    expect(regularMinutesForDate(friday, config)).toBe(5 * 60)
  })
})
