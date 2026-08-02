import { describe, it, expect } from 'vitest'
import { nextBalanceForSettlement, overtimeSettlementDocId } from './overtimeBalance'

describe('nextBalanceForSettlement', () => {
  it('bucht beim ersten Eintrag den vollen Wert vom Konto', () => {
    // 20:00 Konto, 8:00 verrechnen → 12:00 bleiben
    expect(nextBalanceForSettlement(1200, 0, 480)).toBe(720)
  })

  it('bucht bei einer Korrektur nach oben nur die Differenz', () => {
    // 8:00 waren schon verrechnet (das Konto steht deshalb auf 12:00),
    // jetzt sollen es 10:00 sein → nur 2:00 gehen zusätzlich ab.
    expect(nextBalanceForSettlement(720, 480, 600)).toBe(600)
  })

  it('gibt bei einer Korrektur nach unten Stunden zurück aufs Konto', () => {
    expect(nextBalanceForSettlement(720, 480, 120)).toBe(1080)
  })

  it('gibt bei Rücknahme den kompletten Monatswert zurück', () => {
    expect(nextBalanceForSettlement(720, 480, 0)).toBe(1200)
  })

  it('lässt eine unveränderte Eingabe das Konto nicht bewegen', () => {
    expect(nextBalanceForSettlement(720, 480, 480)).toBe(720)
  })

  it('erlaubt genau das Aufbrauchen des Kontos', () => {
    expect(nextBalanceForSettlement(720, 0, 720)).toBe(0)
  })

  it('lehnt mehr Stunden ab, als das Konto hergibt', () => {
    expect(nextBalanceForSettlement(720, 0, 721)).toBeNull()
    // Auch mit Vorbuchung: verfügbar sind 12:00 + 8:00 = 20:00
    expect(nextBalanceForSettlement(720, 480, 1201)).toBeNull()
    expect(nextBalanceForSettlement(720, 480, 1200)).toBe(0)
  })

  it('bleibt über mehrere Korrekturen hinweg konsistent', () => {
    // Startkonto 20:00; der Wert wird im Monat mehrfach geändert.
    let balance = 1200
    let settled = 0
    for (const wanted of [480, 600, 120, 900, 0]) {
      const next = nextBalanceForSettlement(balance, settled, wanted)
      expect(next).not.toBeNull()
      balance = next as number
      settled = wanted
      // Konto + verrechnet ergibt immer wieder den Ausgangsbestand.
      expect(balance + settled).toBe(1200)
    }
  })
})

describe('overtimeSettlementDocId', () => {
  it('bildet je Mitarbeiter und Monat genau einen Schlüssel', () => {
    expect(overtimeSettlementDocId('emp1', '2026-03')).toBe('emp1_2026-03')
    expect(overtimeSettlementDocId('emp1', '2026-04')).not.toBe(
      overtimeSettlementDocId('emp1', '2026-03')
    )
    expect(overtimeSettlementDocId('emp2', '2026-03')).not.toBe(
      overtimeSettlementDocId('emp1', '2026-03')
    )
  })
})
