import { describe, it, expect } from 'vitest'
import {
  minutesFromHourMinuteFields,
  minutesToDecimalHours,
  minutesToHoursLabel,
  parseHoursMinutesInput
} from './hoursInput'

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

describe('minutesFromHourMinuteFields', () => {
  it('setzt Stunden und Minuten zusammen', () => {
    expect(minutesFromHourMinuteFields('152', '40')).toBe(152 * 60 + 40)
    expect(minutesFromHourMinuteFields('8', '05')).toBe(8 * 60 + 5)
  })

  it('zählt leere Minuten als 0', () => {
    expect(minutesFromHourMinuteFields('150', '')).toBe(150 * 60)
  })

  it('nimmt 0 Std als bewusste Angabe, ein leeres Stundenfeld aber nicht', () => {
    // Der Fall aus der Praxis: leeres Feld wurde als „0 Std abrechnen" gespeichert.
    expect(minutesFromHourMinuteFields('0', '0')).toBe(0)
    expect(minutesFromHourMinuteFields('', '')).toBeNull()
    expect(minutesFromHourMinuteFields('', '30')).toBeNull()
  })

  it('lehnt Minuten über 59 und alles außer Ziffern ab', () => {
    expect(minutesFromHourMinuteFields('152', '60')).toBeNull()
    // „152,4" wurde früher als 152:24 gelesen, gemeint waren 152:40.
    expect(minutesFromHourMinuteFields('152,4', '')).toBeNull()
    expect(minutesFromHourMinuteFields('152:40', '')).toBeNull()
    expect(minutesFromHourMinuteFields('-1', '0')).toBeNull()
  })
})
