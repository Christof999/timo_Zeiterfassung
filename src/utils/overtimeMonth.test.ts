import { describe, it, expect } from 'vitest'
import {
  monthKeyForDate,
  monthKeyForPeriod,
  monthKeyLabel,
  monthRange,
  previousMonthKey,
  settleableMonthKeys
} from './overtimeMonth'

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

describe('previousMonthKey', () => {
  it('liefert den abzurechnenden Vormonat', () => {
    // Anfang August wird der Juli gemeldet.
    expect(previousMonthKey(new Date(2026, 7, 4))).toBe('2026-07')
    expect(previousMonthKey(new Date(2026, 7, 31))).toBe('2026-07')
  })

  it('springt am Jahreswechsel korrekt zurück', () => {
    expect(previousMonthKey(new Date(2026, 0, 3))).toBe('2025-12')
  })
})

describe('settleableMonthKeys', () => {
  it('gibt Vormonat und laufenden Monat zurück', () => {
    expect(settleableMonthKeys(new Date(2026, 7, 4))).toEqual(['2026-07', '2026-08'])
  })

  it('funktioniert über den Jahreswechsel', () => {
    expect(settleableMonthKeys(new Date(2026, 0, 15))).toEqual(['2025-12', '2026-01'])
  })
})

describe('monthRange', () => {
  it('liefert ersten und letzten Tag des Monats', () => {
    expect(monthRange('2026-07')).toEqual({ start: '2026-07-01', end: '2026-07-31' })
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    // Schaltjahr
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('passt zu monthKeyForPeriod – der Bericht findet die Meldung wieder', () => {
    const r = monthRange('2026-07')!
    expect(monthKeyForPeriod(r.start, r.end)).toBe('2026-07')
  })

  it('gibt null bei unsinnigem Monat', () => {
    expect(monthRange('kaputt')).toBeNull()
    expect(monthRange('2026-13')).toBeNull()
    expect(monthRange('')).toBeNull()
  })
})
