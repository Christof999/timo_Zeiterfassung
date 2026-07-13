import { describe, it, expect } from 'vitest'
import {
  estimateReturnTravel,
  formatReturnTravelCreditNote,
  getReturnTravelCreditMs,
  RETURN_HOME_BASE
} from './returnTravel'

// Verschiebt einen Punkt um distKm nach Norden (grobe Näherung: 1° Breite ≈ 111 km).
// Damit lässt sich die Luftlinien-Entfernung zum Firmenstandort gezielt einstellen.
const pointAtDistanceKm = (distKm: number) => ({
  lat: RETURN_HOME_BASE.lat + distKm / 111,
  lng: RETURN_HOME_BASE.lng
})

describe('estimateReturnTravel', () => {
  it('gibt null zurück, wenn keine gültigen Koordinaten vorliegen', () => {
    expect(estimateReturnTravel(null)).toBeNull()
    expect(estimateReturnTravel(undefined)).toBeNull()
    expect(estimateReturnTravel({ lat: null, lng: null })).toBeNull()
    expect(estimateReturnTravel({ lat: NaN, lng: 10.9 })).toBeNull()
  })

  it('ergibt ~0 km und keine Gutschrift direkt am Firmenstandort', () => {
    const est = estimateReturnTravel({ lat: RETURN_HOME_BASE.lat, lng: RETURN_HOME_BASE.lng })!
    expect(est.distanceKm).toBeCloseTo(0, 5)
    expect(est.creditMinutes).toBe(0)
    expect(est.creditMs).toBe(0)
  })

  it('bis 20 km: keine Gutschrift', () => {
    expect(estimateReturnTravel(pointAtDistanceKm(5))!.creditMinutes).toBe(0)
    expect(estimateReturnTravel(pointAtDistanceKm(19))!.creditMinutes).toBe(0)
  })

  it('20 bis 50 km: 10 Minuten', () => {
    expect(estimateReturnTravel(pointAtDistanceKm(20))!.creditMinutes).toBe(10)
    expect(estimateReturnTravel(pointAtDistanceKm(35))!.creditMinutes).toBe(10)
    expect(estimateReturnTravel(pointAtDistanceKm(45))!.creditMinutes).toBe(10)
  })

  it('50 bis 70 km: 15 Minuten', () => {
    expect(estimateReturnTravel(pointAtDistanceKm(50))!.creditMinutes).toBe(15)
    expect(estimateReturnTravel(pointAtDistanceKm(65))!.creditMinutes).toBe(15)
  })

  it('ab 70 km: 20 Minuten', () => {
    expect(estimateReturnTravel(pointAtDistanceKm(70))!.creditMinutes).toBe(20)
    expect(estimateReturnTravel(pointAtDistanceKm(120))!.creditMinutes).toBe(20)
  })

  it('creditMs entspricht creditMinutes in Millisekunden', () => {
    const est = estimateReturnTravel(pointAtDistanceKm(55))!
    expect(est.creditMs).toBe(Math.round(est.creditMinutes * 60 * 1000))
  })
})

describe('formatReturnTravelCreditNote', () => {
  it('liefert Leerstring bei fehlender oder unbedeutender Gutschrift', () => {
    expect(formatReturnTravelCreditNote(null)).toBe('')
    expect(
      formatReturnTravelCreditNote({ lat: RETURN_HOME_BASE.lat, lng: RETURN_HOME_BASE.lng })
    ).toBe('')
    // Innerhalb von 20 km keine Gutschrift → kein Hinweistext
    expect(formatReturnTravelCreditNote(pointAtDistanceKm(10))).toBe('')
  })

  it('liefert einen Hinweistext mit den Minuten der Staffel', () => {
    expect(formatReturnTravelCreditNote(pointAtDistanceKm(30))).toBe(' Rückfahrt: 10 Min. angerechnet.')
    expect(formatReturnTravelCreditNote(pointAtDistanceKm(60))).toBe(' Rückfahrt: 15 Min. angerechnet.')
    expect(formatReturnTravelCreditNote(pointAtDistanceKm(80))).toBe(' Rückfahrt: 20 Min. angerechnet.')
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
