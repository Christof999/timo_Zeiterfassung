import { describe, it, expect } from 'vitest'
import {
  contributionForMonth,
  maxSettleableMinutes,
  nextBalanceForSettlement,
  overtimeSettlementDocId,
  previousContribution
} from './overtimeBalance'

const STD = (h: number) => Math.round(h * 60)

describe('contributionForMonth', () => {
  it('schreibt gut, was von den geleisteten Stunden nicht abgerechnet wird', () => {
    // 180 Std geleistet, 170 abgerechnet → 10 Std aufs Konto
    expect(contributionForMonth(STD(180), STD(170))).toBe(STD(10))
  })

  it('ist 0, wenn alles abgerechnet wird', () => {
    expect(contributionForMonth(STD(180), STD(180))).toBe(0)
  })

  it('schreibt alles gut, wenn nichts abgerechnet wird', () => {
    expect(contributionForMonth(STD(180), 0)).toBe(STD(180))
  })

  it('wird negativ, wenn mehr abgerechnet als geleistet wurde', () => {
    // Die fehlenden 20 Std kommen aus dem Ueberstundenkonto – so lassen sich
    // Ueberstunden auszahlen.
    expect(contributionForMonth(STD(180), STD(200))).toBe(-STD(20))
  })
})

describe('previousContribution', () => {
  it('ist 0 ohne bisherigen Eintrag', () => {
    expect(previousContribution(null)).toBe(0)
  })

  it('nimmt beim neuen Modell den nicht abgerechneten Rest', () => {
    expect(previousContribution({ minutes: STD(170), workedMinutes: STD(180) })).toBe(STD(10))
  })

  it('rechnet Alt-Einträge als Abzug zurück', () => {
    // Im alten Modell wurden die gemeldeten Minuten vom Konto ABGEZOGEN.
    // Ihr Beitrag ist deshalb negativ – nur so hebt eine Korrektur die alte
    // Buchung wieder auf, statt sie ein zweites Mal zu verrechnen.
    expect(previousContribution({ minutes: STD(8) })).toBe(-STD(8))
  })
})

describe('nextBalanceForSettlement', () => {
  it('schreibt beim ersten Eintrag den Rest gut', () => {
    // Konto 5 Std, 180 geleistet, 170 abgerechnet → 5 + 10 = 15
    expect(nextBalanceForSettlement(STD(5), null, STD(180), STD(170))).toBe(STD(15))
  })

  it('bucht bei einer Korrektur nur die Differenz', () => {
    // Bisher 170 von 180 abgerechnet (10 gutgeschrieben, Konto steht auf 15).
    // Jetzt nur noch 160 abrechnen → 20 statt 10 gutgeschrieben, also +10.
    const vorher = { minutes: STD(170), workedMinutes: STD(180) }
    expect(nextBalanceForSettlement(STD(15), vorher, STD(180), STD(160))).toBe(STD(25))
  })

  it('nimmt eine Gutschrift zurück, wenn nachträglich alles abgerechnet wird', () => {
    const vorher = { minutes: STD(170), workedMinutes: STD(180) }
    expect(nextBalanceForSettlement(STD(15), vorher, STD(180), STD(180))).toBe(STD(5))
  })

  it('lässt eine unveränderte Eingabe das Konto nicht bewegen', () => {
    const vorher = { minutes: STD(170), workedMinutes: STD(180) }
    expect(nextBalanceForSettlement(STD(15), vorher, STD(180), STD(170))).toBe(STD(15))
  })

  it('dreht einen Alt-Eintrag korrekt auf das neue Modell um', () => {
    // Alt: 8 Std gemeldet und vom Konto abgezogen; Konto steht deshalb auf 12.
    // Neu: 180 geleistet, 170 abgerechnet → 10 gutschreiben UND die alten
    // 8 Std Abzug zurückgeben: 12 + 10 + 8 = 30.
    const alt = { minutes: STD(8) }
    expect(nextBalanceForSettlement(STD(12), alt, STD(180), STD(170))).toBe(STD(30))
  })

  it('verweigert, wenn das Konto ins Minus liefe', () => {
    // Gutschrift von 10 Std wurde bereits verbraucht, Konto steht auf 0.
    // Wird nun alles abgerechnet, müsste die Gutschrift zurück – geht nicht.
    const vorher = { minutes: STD(170), workedMinutes: STD(180) }
    expect(nextBalanceForSettlement(0, vorher, STD(180), STD(180))).toBeNull()
  })

  it('bleibt über mehrere Korrekturen hinweg konsistent', () => {
    const worked = STD(180)
    let balance = STD(5)
    let vorher: { minutes: number; workedMinutes?: number } | null = null
    for (const abgerechnet of [STD(170), STD(160), STD(180), 0, STD(175)]) {
      const next = nextBalanceForSettlement(balance, vorher, worked, abgerechnet)
      expect(next).not.toBeNull()
      balance = next as number
      vorher = { minutes: abgerechnet, workedMinutes: worked }
      // Konto = Startbestand + nicht abgerechneter Rest des Monats
      expect(balance).toBe(STD(5) + (worked - abgerechnet))
    }
  })
})

describe('overtimeSettlementDocId', () => {
  it('bildet je Mitarbeiter und Monat genau einen Schlüssel', () => {
    expect(overtimeSettlementDocId('emp1', '2026-07')).toBe('emp1_2026-07')
    expect(overtimeSettlementDocId('emp1', '2026-08')).not.toBe(
      overtimeSettlementDocId('emp1', '2026-07')
    )
    expect(overtimeSettlementDocId('emp2', '2026-07')).not.toBe(
      overtimeSettlementDocId('emp1', '2026-07')
    )
  })
})

describe('maxSettleableMinutes', () => {
  it('erlaubt geleistete Stunden plus Überstundenkonto', () => {
    // 180 Std geleistet, 12 Std auf dem Konto → bis zu 192 Std abrechenbar
    expect(maxSettleableMinutes(STD(12), null, STD(180))).toBe(STD(192))
  })

  it('rechnet einen bereits gebuchten Monat heraus', () => {
    // Bisher 170 von 180 gemeldet, die 10 Std Gutschrift stecken schon im
    // Kontostand von 22. Ohne Herausrechnen käme man auf 202 statt 192.
    const vorher = { minutes: STD(170), workedMinutes: STD(180) }
    expect(maxSettleableMinutes(STD(22), vorher, STD(180))).toBe(STD(192))
  })

  it('ist ohne Stunden und ohne Konto null', () => {
    expect(maxSettleableMinutes(0, null, 0)).toBe(0)
  })
})

describe('Überstunden auszahlen lassen', () => {
  it('nimmt die Differenz vom Konto, wenn mehr abgerechnet wird als geleistet', () => {
    // Konto 12 Std, 180 geleistet, 190 abgerechnet → 10 Std vom Konto, bleiben 2
    expect(nextBalanceForSettlement(STD(12), null, STD(180), STD(190))).toBe(STD(2))
  })

  it('erlaubt genau das Leerräumen des Kontos', () => {
    expect(nextBalanceForSettlement(STD(12), null, STD(180), STD(192))).toBe(0)
  })

  it('verweigert eine Minute mehr als geleistet plus Konto', () => {
    expect(nextBalanceForSettlement(STD(12), null, STD(180), STD(192) + 1)).toBeNull()
  })

  it('lässt den Wechsel von Ansparen auf Auszahlen zu', () => {
    // Erst 170 von 180 gemeldet (Konto 12 → 22), dann auf 200 erhöhen:
    // 20 Std vom Konto, also 22 − 10 (Gutschrift zurück) − 20 = 2 … präzise:
    // Beitrag vorher +10, jetzt −20, Delta −30 → 22 − 30 = −8 → nicht erlaubt.
    const vorher = { minutes: STD(170), workedMinutes: STD(180) }
    expect(nextBalanceForSettlement(STD(22), vorher, STD(180), STD(200))).toBeNull()
    // Bis zur Obergrenze geht es aber:
    const grenze = maxSettleableMinutes(STD(22), vorher, STD(180))
    expect(nextBalanceForSettlement(STD(22), vorher, STD(180), grenze)).toBe(0)
  })
})
