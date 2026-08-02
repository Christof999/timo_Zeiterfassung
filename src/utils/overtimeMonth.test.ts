import { describe, it, expect } from 'vitest'
import { monthKeyForDate, monthKeyForPeriod, monthKeyLabel } from './overtimeMonth'

describe('overtimeMonth', () => {
  it('bildet den Monatsschlüssel lokal, nicht über UTC', () => {
    // 1. März 00:30 Ortszeit – über toISOString wäre das in UTC noch Februar.
    expect(monthKeyForDate(new Date(2026, 2, 1, 0, 30))).toBe('2026-03')
    expect(monthKeyForDate(new Date(2026, 11, 31, 23, 30))).toBe('2026-12')
  })

  it('beschriftet Monate auf Deutsch', () => {
    expect(monthKeyLabel('2026-03')).toBe('März 2026')
    expect(monthKeyLabel('2026-01')).toBe('Januar 2026')
    expect(monthKeyLabel('kaputt')).toBe('kaputt')
  })

  it('ordnet einen Zeitraum nur bei eindeutigem Monat zu', () => {
    expect(monthKeyForPeriod('2026-03-01', '2026-03-31')).toBe('2026-03')
    expect(monthKeyForPeriod('2026-03-10', '2026-03-12')).toBe('2026-03')
    // Monatsübergreifend gibt es keinen Monat, dem die Verrechnung gehört.
    expect(monthKeyForPeriod('2026-02-24', '2026-03-05')).toBeNull()
    expect(monthKeyForPeriod('', '2026-03-05')).toBeNull()
  })
})
