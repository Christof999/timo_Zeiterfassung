import { describe, it, expect } from 'vitest'
import { completedMonthsSince, vacationBalance, type VacationAccount } from './vacationAccount'

const d = (iso: string) => new Date(`${iso}T12:00:00`)
const account: VacationAccount = { openingDays: 11, asOfMonth: '2026-10', monthlyDays: 2.5 }
const vacation = (startDate: string, endDate: string, status = 'approved', type = 'vacation') => ({
  startDate: d(startDate),
  endDate: d(endDate),
  status,
  type
})

describe('Urlaubskonto aus der Lohnabrechnung', () => {
  it('schreibt einen Monat erst gut, wenn er vorbei ist', () => {
    expect(completedMonthsSince('2026-10', d('2026-11-11'))).toBe(0)
    expect(completedMonthsSince('2026-10', d('2026-11-30'))).toBe(0)
    expect(completedMonthsSince('2026-10', d('2026-12-01'))).toBe(1)
    expect(completedMonthsSince('2026-10', d('2027-02-15'))).toBe(3)
  })

  it('startet mit dem Resturlaub der Lohnabrechnung', () => {
    expect(vacationBalance(account, [], d('2026-11-11'))).toEqual({ earned: 0, taken: 0, remaining: 11 })
  })

  it('gibt Vollzeit 2,5 Tage je Monat und läuft über den Jahreswechsel weiter', () => {
    expect(vacationBalance(account, [], d('2027-01-05')).remaining).toBe(16)
  })

  it('zieht nur genehmigte Urlaubstage nach dem Stichtag ab', () => {
    const requests = [
      vacation('2026-10-19', '2026-10-20'), // steckt schon in der Lohnabrechnung
      vacation('2026-11-16', '2026-11-16'),
      vacation('2026-12-14', '2026-12-18'), // verplant, zählt sofort
      vacation('2026-11-23', '2026-11-24', 'pending'),
      vacation('2026-11-25', '2026-11-25', 'approved', 'overtime'),
      vacation('2026-11-26', '2026-11-26', 'approved', 'sick')
    ]
    expect(vacationBalance(account, requests, d('2026-11-11'))).toEqual({ earned: 0, taken: 6, remaining: 5 })
  })

  it('zählt Feiertage nicht als Urlaubstag', () => {
    // 24.12. Do, 25.12. Fr Feiertag
    expect(vacationBalance(account, [vacation('2026-12-24', '2026-12-25')], d('2026-11-11')).taken).toBe(1)
  })

  it('rechnet krumme Anfangsbestände ohne Rundungsfehler', () => {
    const newcomer = { openingDays: 1.33, asOfMonth: '2026-10', monthlyDays: 2.5 }
    expect(vacationBalance(newcomer, [], d('2027-01-02')).remaining).toBe(6.33)
  })
})
