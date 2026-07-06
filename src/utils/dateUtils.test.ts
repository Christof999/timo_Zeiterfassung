import { describe, it, expect } from 'vitest'
import { formatDateForInputLocal, toDateInputValue } from './dateUtils'

describe('formatDateForInputLocal', () => {
  it('formatiert lokal als YYYY-MM-DD mit führenden Nullen', () => {
    expect(formatDateForInputLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(formatDateForInputLocal(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('toDateInputValue', () => {
  it('akzeptiert Date-Objekte', () => {
    expect(toDateInputValue(new Date(2026, 6, 6))).toBe('2026-07-06')
  })

  it('akzeptiert Firestore-Timestamps (toDate)', () => {
    const fakeTimestamp = { toDate: () => new Date(2026, 2, 15) }
    expect(toDateInputValue(fakeTimestamp)).toBe('2026-03-15')
  })

  it('akzeptiert rohe {seconds}-Objekte', () => {
    const seconds = Math.floor(new Date(2026, 2, 15, 12).getTime() / 1000)
    expect(toDateInputValue({ seconds })).toBe('2026-03-15')
  })

  it('akzeptiert parsebare Strings', () => {
    expect(toDateInputValue('2026-03-15T10:30:00')).toBe('2026-03-15')
  })

  it('liefert Leerstring für leere/ungültige Werte', () => {
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue(undefined)).toBe('')
    expect(toDateInputValue('')).toBe('')
    expect(toDateInputValue('kein-datum')).toBe('')
  })
})
