import { describe, it, expect } from 'vitest'
import { minutesToDecimalHours, minutesToHoursLabel, parseHoursMinutesInput } from './hoursInput'

describe('minutesToDecimalHours', () => {
  it('rechnet Minuten in Dezimalstunden mit deutschem Komma um', () => {
    // Genau der Fall, den die Kanzlei bisher von Hand gerechnet hat.
    expect(minutesToDecimalHours(30)).toBe('0,50')
    expect(minutesToDecimalHours(25 * 60 + 30)).toBe('25,50')
    expect(minutesToDecimalHours(66 * 60)).toBe('66,00')
  })

  it('zeigt immer zwei Nachkommastellen, damit Viertelstunden aufgehen', () => {
    expect(minutesToDecimalHours(15)).toBe('0,25')
    expect(minutesToDecimalHours(8 * 60 + 45)).toBe('8,75')
    expect(minutesToDecimalHours(0)).toBe('0,00')
  })

  it('rundet Drittelstunden kaufmännisch auf zwei Stellen', () => {
    // 20 Min = 0,333… Std
    expect(minutesToDecimalHours(20)).toBe('0,33')
    expect(minutesToDecimalHours(50)).toBe('0,83')
  })

  it('bleibt umkehrbar: Dezimaleingabe und Anzeige passen zusammen', () => {
    const minuten = 8 * 60 + 30
    expect(parseHoursMinutesInput(minutesToDecimalHours(minuten))).toBe(minuten)
    // Die Stunden:Minuten-Schreibweise bleibt daneben unverändert bestehen.
    expect(minutesToHoursLabel(minuten)).toBe('8:30')
  })
})
