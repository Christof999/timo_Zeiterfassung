import { describe, expect, it } from 'vitest'
import type { OfferPosition, TimeEntry } from '../types'
import {
  bookedEntryHours,
  bookedHoursByProject,
  formatOfferHours,
  offerHoursUsage,
  quotedLaborHours
} from './offerHours'

const labor = (quantity: number, unit: string, kind: OfferPosition['kind'] = 'labor'): OfferPosition => ({
  name: 'Arbeit',
  kind,
  unit,
  quantity
})

const entry = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e',
    employeeId: 'm',
    projectId: 'p',
    clockInTime: new Date(2026, 8, 1, 8, 0),
    clockOutTime: new Date(2026, 8, 1, 16, 0),
    pauseTotalTime: 30 * 60 * 1000,
    ...over
  }) as TimeEntry

describe('quotedLaborHours', () => {
  it('summiert nur Lohnpositionen in Stundeneinheiten', () => {
    expect(
      quotedLaborHours([
        labor(40, 'Std'),
        labor(10, 'h'),
        labor(12.5, 'Std.'),
        labor(8, 'm²'),
        labor(5, 'Std', 'material'),
        labor(0, 'Stunden')
      ])
    ).toBe(62.5)
  })

  it('erkennt die Einheiten unabhängig von der Großschreibung', () => {
    expect(quotedLaborHours([labor(3, 'STUNDEN'), labor(2, 'Akh'), labor(1, 'AW')])).toBe(6)
  })

  it('liefert null, wenn das Angebot keine Arbeitsstunden hat', () => {
    expect(quotedLaborHours(undefined)).toBeNull()
    expect(quotedLaborHours([])).toBeNull()
    expect(quotedLaborHours([labor(20, 'm²'), labor(1, 'Tag')])).toBeNull()
  })
})

describe('bookedEntryHours', () => {
  it('rechnet Anwesenheit minus Pause, auf dem 15-Minuten-Raster', () => {
    // 8:00–16:00 minus 30 Min Pause = 7,5 Std
    expect(bookedEntryHours(entry())).toBe(7.5)
  })

  it('zählt die gespeicherte Rückfahrt dazu', () => {
    expect(bookedEntryHours(entry({ returnTravelCreditMs: 30 * 60 * 1000 }))).toBe(8)
  })

  it('lässt aufgefüllte Überstunden, offene Stempelungen und Urlaub weg', () => {
    expect(bookedEntryHours(entry({ overtimeFillMinutes: 120 }))).toBe(7.5)
    expect(bookedEntryHours(entry({ clockOutTime: null }))).toBe(0)
    expect(bookedEntryHours(entry({ isVacationDay: true }))).toBe(0)
  })
})

describe('bookedHoursByProject', () => {
  it('summiert je Projekt und ignoriert Kleinaufträge ohne Projekt', () => {
    const totals = bookedHoursByProject([
      entry({ projectId: 'a' }),
      entry({ projectId: 'a', clockInTime: new Date(2026, 8, 2, 8, 0), clockOutTime: new Date(2026, 8, 2, 12, 0), pauseTotalTime: 0 }),
      entry({ projectId: 'b' }),
      entry({ projectId: '' })
    ])
    expect(totals.get('a')).toBe(7.5 + 4)
    expect(totals.get('b')).toBe(7.5)
    expect(totals.has('')).toBe(false)
  })
})

describe('offerHoursUsage', () => {
  it('setzt die Angebotsstunden als 100 Prozent', () => {
    const usage = offerHoursUsage(100, 42.5)
    expect(usage.percent).toBe(43)
    expect(usage.ratio).toBeCloseTo(0.425)
  })

  it('lässt den Anteil über 100 Prozent laufen', () => {
    expect(offerHoursUsage(100, 128).percent).toBe(128)
  })

  it('formatiert Stunden mit deutschem Komma', () => {
    expect(formatOfferHours(42.5)).toBe('42,5')
    expect(formatOfferHours(100)).toBe('100')
  })
})
