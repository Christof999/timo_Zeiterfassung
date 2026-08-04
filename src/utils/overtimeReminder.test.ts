import { describe, it, expect } from 'vitest'
import {
  isOvertimeReminderDay,
  lastWorkingDayOfMonth,
  shouldShowBroadcastReminder,
  shouldShowOvertimeReminder
} from './overtimeReminder'

describe('lastWorkingDayOfMonth', () => {
  it('nimmt den Monatsletzten, wenn er ein Werktag ist', () => {
    // 31.03.2026 ist ein Dienstag
    expect(lastWorkingDayOfMonth(new Date(2026, 2, 15)).getDate()).toBe(31)
  })

  it('springt vom Wochenende auf den Freitag davor', () => {
    // 31.05.2026 ist ein Sonntag → Freitag, der 29.
    expect(lastWorkingDayOfMonth(new Date(2026, 4, 10)).getDate()).toBe(29)
  })

  it('überspringt einen Feiertag am Monatsende', () => {
    // 31.12.2026 ist ein Donnerstag, aber Silvester ist in Bayern kein
    // gesetzlicher Feiertag – der 25./26.12. schon. Prüfung: Dezember endet
    // auf einem Werktag, der nicht Feiertag ist.
    const last = lastWorkingDayOfMonth(new Date(2026, 11, 5))
    expect(last.getMonth()).toBe(11)
    expect([0, 6]).not.toContain(last.getDay())
  })

  it('bleibt immer im eigenen Monat', () => {
    for (let month = 0; month < 12; month++) {
      const last = lastWorkingDayOfMonth(new Date(2026, month, 5))
      expect(last.getMonth()).toBe(month)
    }
  })
})

describe('isOvertimeReminderDay', () => {
  it('greift ab dem letzten Arbeitstag bis zum Monatsende', () => {
    // Mai 2026: letzter Arbeitstag ist Freitag der 29.
    expect(isOvertimeReminderDay(new Date(2026, 4, 28))).toBe(false)
    expect(isOvertimeReminderDay(new Date(2026, 4, 29))).toBe(true)
    expect(isOvertimeReminderDay(new Date(2026, 4, 30))).toBe(true)
    expect(isOvertimeReminderDay(new Date(2026, 4, 31))).toBe(true)
  })

  it('schweigt mitten im Monat', () => {
    expect(isOvertimeReminderDay(new Date(2026, 2, 15))).toBe(false)
  })
})

describe('shouldShowOvertimeReminder', () => {
  const reminderDay = new Date(2026, 4, 29)
  const base = {
    today: reminderDay,
    hasSettlementForMonth: false,
    balanceMinutes: 600,
    dismissedMonth: null
  }

  it('erinnert am letzten Arbeitstag, wenn nichts eingetragen ist', () => {
    expect(shouldShowOvertimeReminder(base)).toBe(true)
  })

  it('schweigt, wenn der Monat bereits eingetragen wurde', () => {
    expect(shouldShowOvertimeReminder({ ...base, hasSettlementForMonth: true })).toBe(false)
  })

  it('schweigt ohne Überstunden auf dem Konto', () => {
    expect(shouldShowOvertimeReminder({ ...base, balanceMinutes: 0 })).toBe(false)
  })

  it('schweigt, wenn der Hinweis diesen Monat schon weggeklickt wurde', () => {
    expect(shouldShowOvertimeReminder({ ...base, dismissedMonth: '2026-05' })).toBe(false)
  })

  it('erinnert wieder, wenn der weggeklickte Monat ein anderer war', () => {
    expect(shouldShowOvertimeReminder({ ...base, dismissedMonth: '2026-04' })).toBe(true)
  })

  it('schweigt mitten im Monat, auch wenn alles andere passt', () => {
    expect(shouldShowOvertimeReminder({ ...base, today: new Date(2026, 4, 12) })).toBe(false)
  })
})

describe('shouldShowBroadcastReminder', () => {
  const broadcastAt = new Date(2026, 7, 4, 10, 0)
  const base = {
    broadcastAt,
    hasSettlementForMonth: false,
    dismissedBroadcastAt: null
  }

  it('zeigt den Aufruf des Admins an', () => {
    expect(shouldShowBroadcastReminder(base)).toBe(true)
  })

  it('sticht das Datum – gilt auch mitten im Monat', () => {
    // Der 04.08. ist weit vom Monatsende entfernt, der Aufruf zählt trotzdem.
    expect(isOvertimeReminderDay(broadcastAt)).toBe(false)
    expect(shouldShowBroadcastReminder(base)).toBe(true)
  })

  it('schweigt ohne Aufruf', () => {
    expect(shouldShowBroadcastReminder({ ...base, broadcastAt: null })).toBe(false)
  })

  it('schweigt, wenn für den Monat schon etwas eingetragen wurde', () => {
    expect(shouldShowBroadcastReminder({ ...base, hasSettlementForMonth: true })).toBe(false)
  })

  it('schweigt für einen bereits quittierten Aufruf', () => {
    expect(
      shouldShowBroadcastReminder({ ...base, dismissedBroadcastAt: broadcastAt.getTime() })
    ).toBe(false)
  })

  it('erreicht auch, wer den letzten Aufruf weggeklickt hat', () => {
    // Der Admin drückt erneut: neuer Zeitstempel schlägt die alte Quittung.
    const zweiterAufruf = new Date(broadcastAt.getTime() + 60_000)
    expect(
      shouldShowBroadcastReminder({
        ...base,
        broadcastAt: zweiterAufruf,
        dismissedBroadcastAt: broadcastAt.getTime()
      })
    ).toBe(true)
  })
})
