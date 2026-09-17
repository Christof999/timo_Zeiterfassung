import { describe, it, expect } from 'vitest'
import { canOfferDayFill, planDayFill } from './overtimeDayFill'

const STD = (h: number) => Math.round(h * 60)

// 2026-09-14 = Montag, 2026-09-17 = Donnerstag,
// 2026-09-18 = Freitag, 2026-09-19 = Samstag, 2026-09-20 = Sonntag
const MONTAG = '2026-09-14'
const DONNERSTAG = '2026-09-17'
const FREITAG = '2026-09-18'
const SAMSTAG = '2026-09-19'
const SONNTAG = '2026-09-20'

describe('planDayFill', () => {
  it('füllt Montag bis Donnerstag auf 8 Stunden auf', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(6),
      balanceMinutes: STD(20)
    })
    expect(plan.regularMinutes).toBe(STD(8))
    expect(plan.missingMinutes).toBe(STD(2))
    expect(plan.fillMinutes).toBe(STD(2))
    expect(plan.isPartial).toBe(false)
  })

  it('füllt am Freitag nur auf 6 Stunden auf', () => {
    const plan = planDayFill({
      dateKey: FREITAG,
      workedMinutes: STD(4.5),
      balanceMinutes: STD(20)
    })
    expect(plan.regularMinutes).toBe(STD(6))
    expect(plan.fillMinutes).toBe(STD(1.5))
  })

  it('bietet am Freitag nichts an, wenn die 6 Stunden schon voll sind', () => {
    // 7 Std am Freitag sind bereits eine Überstunde – hier gibt es nichts
    // aufzufüllen, obwohl 7 < 8 ist.
    const plan = planDayFill({
      dateKey: FREITAG,
      workedMinutes: STD(7),
      balanceMinutes: STD(20)
    })
    expect(plan.missingMinutes).toBe(0)
    expect(plan.fillMinutes).toBe(0)
  })

  it('rechnet auf die Viertelstunde genau', () => {
    const plan = planDayFill({
      dateKey: DONNERSTAG,
      workedMinutes: STD(7.75),
      balanceMinutes: STD(20)
    })
    expect(plan.fillMinutes).toBe(15)
  })

  it('nimmt höchstens das, was auf dem Konto liegt', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(5),
      balanceMinutes: 45
    })
    expect(plan.missingMinutes).toBe(STD(3))
    expect(plan.fillMinutes).toBe(45)
    expect(plan.isPartial).toBe(true)
  })

  it('führt den Kontostand mit, mit dem gerechnet wurde', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(6),
      balanceMinutes: STD(20)
    })
    expect(plan.balanceMinutes).toBe(STD(20))
  })

  it('bietet bei leerem Konto nichts an', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(5),
      balanceMinutes: 0
    })
    expect(plan.fillMinutes).toBe(0)
    expect(plan.isPartial).toBe(false)
  })

  it('bietet am Wochenende nichts an', () => {
    for (const dateKey of [SAMSTAG, SONNTAG]) {
      const plan = planDayFill({ dateKey, workedMinutes: STD(3), balanceMinutes: STD(20) })
      expect(plan.regularMinutes).toBe(0)
      expect(plan.fillMinutes).toBe(0)
    }
  })

  it('bietet nichts an, wenn die Regelarbeitszeit bereits erreicht ist', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(9),
      balanceMinutes: STD(20)
    })
    expect(plan.missingMinutes).toBe(0)
    expect(plan.fillMinutes).toBe(0)
  })

  it('füllt einen bereits aufgefüllten Tag nicht erneut auf', () => {
    // 6 Std gestempelt + 2 Std bereits aufgefüllt stecken in workedMinutes.
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(8),
      balanceMinutes: STD(20)
    })
    expect(plan.fillMinutes).toBe(0)
  })

  it('folgt einer abweichenden Regelarbeitszeit', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(5),
      balanceMinutes: STD(20),
      config: { monThu: STD(7), fri: STD(5) }
    })
    expect(plan.regularMinutes).toBe(STD(7))
    expect(plan.fillMinutes).toBe(STD(2))
  })

  it('verkraftet unsinnige Eingaben', () => {
    const plan = planDayFill({
      dateKey: MONTAG,
      workedMinutes: Number.NaN,
      balanceMinutes: -120
    })
    expect(plan.workedMinutes).toBe(0)
    expect(plan.missingMinutes).toBe(STD(8))
    expect(plan.fillMinutes).toBe(0)
  })
})

describe('canOfferDayFill', () => {
  const plan = planDayFill({
    dateKey: MONTAG,
    workedMinutes: STD(6),
    balanceMinutes: STD(20)
  })

  it('bietet den Knopf im ausgestempelten Zustand an', () => {
    expect(canOfferDayFill(plan, { isClockedIn: false, hasCompletedEntry: true })).toBe(true)
  })

  it('bietet nichts an, solange der Mitarbeiter eingestempelt ist', () => {
    expect(canOfferDayFill(plan, { isClockedIn: true, hasCompletedEntry: true })).toBe(false)
  })

  it('bietet nichts an, wenn an dem Tag gar nicht gestempelt wurde', () => {
    expect(canOfferDayFill(plan, { isClockedIn: false, hasCompletedEntry: false })).toBe(false)
  })

  it('bietet nichts an, wenn nichts aufzufüllen ist', () => {
    const voll = planDayFill({
      dateKey: MONTAG,
      workedMinutes: STD(8),
      balanceMinutes: STD(20)
    })
    expect(canOfferDayFill(voll, { isClockedIn: false, hasCompletedEntry: true })).toBe(false)
  })
})
