import { describe, it, expect } from 'vitest'
import {
  estimateReturnTravel,
  formatReturnTravelCreditNote,
  getReturnTravelCreditMs,
  RETURN_HOME_BASE
} from './returnTravel'

describe('estimateReturnTravel', () => {
  it('gibt null zurück, wenn keine gültigen Koordinaten vorliegen', () => {
    expect(estimateReturnTravel(null)).toBeNull()
    expect(estimateReturnTravel(undefined)).toBeNull()
    expect(estimateReturnTravel({ lat: null, lng: null })).toBeNull()
    expect(estimateReturnTravel({ lat: NaN, lng: 10.9 })).toBeNull()
  })

  it('ergibt ~0 km direkt am Firmenstandort', () => {
    const est = estimateReturnTravel({ lat: RETURN_HOME_BASE.lat, lng: RETURN_HOME_BASE.lng })!
    expect(est.distanceKm).toBeCloseTo(0, 5)
    expect(est.creditMs).toBe(0)
  })

  it('schätzt Entfernung, Fahrtzeit und halbe Gutschrift konsistent', () => {
    // Nürnberg (~49.45, 11.08) liegt grob 45 km Luftlinie von Ellingen entfernt.
    const est = estimateReturnTravel({ lat: 49.45, lng: 11.08 })!
    expect(est.distanceKm).toBeGreaterThan(40)
    expect(est.distanceKm).toBeLessThan(80)
    // oneWayMinutes = km / 50 km/h * 60; creditMinutes = Hälfte davon
    expect(est.oneWayMinutes).toBeCloseTo((est.distanceKm / 50) * 60, 6)
    expect(est.creditMinutes).toBeCloseTo(est.oneWayMinutes / 2, 6)
    expect(est.creditMs).toBe(Math.round(est.creditMinutes * 60 * 1000))
  })
})

describe('formatReturnTravelCreditNote', () => {
  it('liefert Leerstring bei fehlender oder unbedeutender Gutschrift', () => {
    expect(formatReturnTravelCreditNote(null)).toBe('')
    expect(
      formatReturnTravelCreditNote({ lat: RETURN_HOME_BASE.lat, lng: RETURN_HOME_BASE.lng })
    ).toBe('')
  })

  it('liefert einen Hinweistext mit gerundeten Minuten', () => {
    const note = formatReturnTravelCreditNote({ lat: 49.45, lng: 11.08 })
    expect(note).toMatch(/Rückfahrt: \d+ Min\. angerechnet\./)
  })
})

describe('getReturnTravelCreditMs', () => {
  it('liest den gespeicherten Wert', () => {
    expect(getReturnTravelCreditMs({ returnTravelCreditMs: 900000 })).toBe(900000)
  })

  it('ergibt 0 für fehlende/ungültige/negative Werte', () => {
    expect(getReturnTravelCreditMs(null)).toBe(0)
    expect(getReturnTravelCreditMs(undefined)).toBe(0)
    expect(getReturnTravelCreditMs({} as never)).toBe(0)
    expect(getReturnTravelCreditMs({ returnTravelCreditMs: -5 })).toBe(0)
    expect(getReturnTravelCreditMs({ returnTravelCreditMs: NaN })).toBe(0)
  })
})
