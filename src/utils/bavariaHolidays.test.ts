import { describe, it, expect } from 'vitest'
import { getBavariaHolidaysForYear, getBavariaHolidayName } from './bavariaHolidays'

describe('getBavariaHolidaysForYear', () => {
  it('berechnet die beweglichen Feiertage 2026 korrekt (Ostern = 5. April)', () => {
    const holidays = getBavariaHolidaysForYear(2026)
    const byName = new Map(holidays.map((h) => [h.name, h.dateKey]))
    expect(byName.get('Karfreitag')).toBe('2026-04-03')
    expect(byName.get('Ostermontag')).toBe('2026-04-06')
    expect(byName.get('Christi Himmelfahrt')).toBe('2026-05-14')
    expect(byName.get('Pfingstmontag')).toBe('2026-05-25')
    expect(byName.get('Fronleichnam')).toBe('2026-06-04')
  })

  it('berechnet die beweglichen Feiertage 2025 korrekt (Ostern = 20. April)', () => {
    const holidays = getBavariaHolidaysForYear(2025)
    const byName = new Map(holidays.map((h) => [h.name, h.dateKey]))
    expect(byName.get('Karfreitag')).toBe('2025-04-18')
    expect(byName.get('Fronleichnam')).toBe('2025-06-19')
  })

  it('enthält die festen Feiertage und ist sortiert', () => {
    const holidays = getBavariaHolidaysForYear(2026)
    const keys = holidays.map((h) => h.dateKey)
    expect(keys).toContain('2026-01-01')
    expect(keys).toContain('2026-01-06')
    expect(keys).toContain('2026-05-01')
    expect(keys).toContain('2026-10-03')
    expect(keys).toContain('2026-11-01')
    expect(keys).toContain('2026-12-25')
    expect(keys).toContain('2026-12-26')
    expect([...keys].sort()).toEqual(keys)
  })
})

describe('getBavariaHolidayName', () => {
  it('erkennt einen Feiertag', () => {
    expect(getBavariaHolidayName(new Date(2026, 11, 25))).toBe('1. Weihnachtsfeiertag')
  })

  it('liefert null für normale Arbeitstage', () => {
    expect(getBavariaHolidayName(new Date(2026, 6, 7))).toBeNull()
  })
})
