import { describe, it, expect } from 'vitest'
import { roundTimeToStep, roundedSpanMs, TIME_ROUND_STEP_MINUTES } from './timeRounding'

const at = (h: number, m: number, s = 0) => new Date(2026, 5, 15, h, m, s)

describe('roundTimeToStep', () => {
  it('rundet auf das nächste 15-Minuten-Raster (kaufmännisch)', () => {
    expect(TIME_ROUND_STEP_MINUTES).toBe(15)
    expect(roundTimeToStep(at(15, 39))!.getMinutes()).toBe(45)
    expect(roundTimeToStep(at(15, 7))!.getMinutes()).toBe(0)
    expect(roundTimeToStep(at(15, 7))!.getHours()).toBe(15)
  })

  it('lässt exakte Rasterzeiten unverändert', () => {
    const r = roundTimeToStep(at(8, 30))!
    expect(r.getHours()).toBe(8)
    expect(r.getMinutes()).toBe(30)
  })

  it('rundet 7,5 Minuten (Mittelpunkt) auf', () => {
    // Math.round: 07:52.5 → 52.5/15 = 3.5 → 4 → 60 Min → 08:00
    const r = roundTimeToStep(at(7, 53))!
    expect(r.getHours()).toBe(8)
    expect(r.getMinutes()).toBe(0)
  })

  it('rundet über die Stundengrenze (23:55 → 24:00 des gleichen Tags)', () => {
    const r = roundTimeToStep(at(23, 55))!
    // setHours(0, 1440) rollt auf den Folgetag 00:00
    expect(r.getDate()).toBe(16)
    expect(r.getHours()).toBe(0)
    expect(r.getMinutes()).toBe(0)
  })

  it('verwirft Sekunden', () => {
    const r = roundTimeToStep(at(9, 0, 59))!
    expect(r.getSeconds()).toBe(0)
    expect(r.getMinutes()).toBe(0)
  })

  it('gibt null für null/undefined zurück', () => {
    expect(roundTimeToStep(null)).toBeNull()
    expect(roundTimeToStep(undefined)).toBeNull()
  })
})

describe('roundedSpanMs', () => {
  it('berechnet die Brutto-Dauer aus gerundeten Zeiten', () => {
    // 07:52 → 07:45? Nein: 52/15 = 3.47 → 3 → 07:45. 16:22 → 16:30? 22/15=1.47→1 → 16:15
    const span = roundedSpanMs(at(8, 7), at(16, 38))
    // 08:07 → 08:00, 16:38 → 16:45 ⇒ 8h45min
    expect(span).toBe((8 * 60 + 45) * 60 * 1000)
  })

  it('ergibt 0 bei identischen Zeiten', () => {
    expect(roundedSpanMs(at(9, 2), at(9, 2))).toBe(0)
  })
})
