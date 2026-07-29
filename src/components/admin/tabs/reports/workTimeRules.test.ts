import { describe, it, expect } from 'vitest'
import {
  MAX_DAILY_WORK_MINUTES,
  addMinutesToClock,
  allocateOvertimePayout,
  applyWorkTimeRules,
  breakMinutesForNetTarget,
  grossMinutesFromParts,
  parseHoursMinutesInput,
  requiredBreakMinutes,
  type WorkTimeRowInput
} from './workTimeRules'

const row = (overrides: Partial<WorkTimeRowInput> & { id: string }): WorkTimeRowInput => ({
  dateKey: '2026-03-02',
  order: 0,
  clockIn: '07:00',
  clockOut: '15:00',
  pauseMinutes: 0,
  creditMinutes: 0,
  isFixed: false,
  ...overrides
})

describe('Pausenanspruch', () => {
  it('greift ab 6 Std mit 30 Min und ab 9 Std mit 45 Min', () => {
    expect(requiredBreakMinutes(5 * 60 + 59)).toBe(0)
    expect(requiredBreakMinutes(6 * 60)).toBe(30)
    expect(requiredBreakMinutes(8 * 60 + 59)).toBe(30)
    expect(requiredBreakMinutes(9 * 60)).toBe(45)
    expect(requiredBreakMinutes(12 * 60)).toBe(45)
  })

  it('ist als Umkehrung zur Zielzeit in sich stimmig', () => {
    // Zu jeder Zielzeit muss die zurückgerechnete Anwesenheit genau die Pause
    // verlangen, die angesetzt wurde — sonst wäre der Ausdruck widersprüchlich.
    for (let net = 0; net <= MAX_DAILY_WORK_MINUTES; net += 5) {
      const pause = breakMinutesForNetTarget(net)
      expect(requiredBreakMinutes(net + pause)).toBe(pause)
    }
  })
})

describe('Gesetzliche Korrektur im Bericht', () => {
  it('ergänzt 30 Min Pause bei 8 Std Anwesenheit ohne Pause', () => {
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '07:00', clockOut: '15:00' })])
    const result = rows.get('a')!
    expect(result.pauseMinutes).toBe(30)
    expect(result.workMinutes).toBe(7 * 60 + 30)
    // Ohne Deckelung bleibt die gestempelte Gehen-Zeit stehen.
    expect(result.clockOut).toBe('15:00')
    expect(result.adjustments).toContain('break')
  })

  it('füllt eine zu kurze Pause auf das gesetzliche Minimum auf', () => {
    const { rows } = applyWorkTimeRules([
      row({ id: 'a', clockIn: '07:00', clockOut: '15:00', pauseMinutes: 10 })
    ])
    expect(rows.get('a')!.pauseMinutes).toBe(30)
    expect(rows.get('a')!.workMinutes).toBe(7 * 60 + 30)
  })

  it('lässt eine ausreichend lange Pause unangetastet', () => {
    const { rows } = applyWorkTimeRules([
      row({ id: 'a', clockIn: '07:00', clockOut: '15:00', pauseMinutes: 60 })
    ])
    const result = rows.get('a')!
    expect(result.pauseMinutes).toBe(60)
    expect(result.workMinutes).toBe(7 * 60)
    expect(result.adjustments).toEqual([])
  })

  it('greift bei exakt 6 Std Anwesenheit', () => {
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '07:00', clockOut: '13:00' })])
    expect(rows.get('a')!.pauseMinutes).toBe(30)
    expect(rows.get('a')!.workMinutes).toBe(5 * 60 + 30)
  })

  it('lässt knapp unter 6 Std unangetastet', () => {
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '07:00', clockOut: '12:59' })])
    expect(rows.get('a')!.pauseMinutes).toBe(0)
    expect(rows.get('a')!.workMinutes).toBe(5 * 60 + 59)
  })

  it('rechnet 10:45 Anwesenheit mit 45 Min Pause auf glatte 10:00', () => {
    // Das Beispiel aus der Anforderung.
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '06:00', clockOut: '16:45' })])
    const result = rows.get('a')!
    expect(result.pauseMinutes).toBe(45)
    expect(result.workMinutes).toBe(MAX_DAILY_WORK_MINUTES)
    expect(result.clockOut).toBe('16:45')
    expect(result.adjustments).not.toContain('max-hours')
  })

  it('deckelt auf 10 Std und zieht die Gehen-Zeit entsprechend vor', () => {
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '06:00', clockOut: '18:00' })])
    const result = rows.get('a')!
    expect(result.pauseMinutes).toBe(45)
    expect(result.workMinutes).toBe(MAX_DAILY_WORK_MINUTES)
    expect(result.clockOut).toBe('16:45')
    expect(result.adjustments).toContain('max-hours')
  })

  it('behandelt Nachtschichten über Mitternacht', () => {
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '20:00', clockOut: '04:00' })])
    expect(rows.get('a')!.pauseMinutes).toBe(30)
    expect(rows.get('a')!.workMinutes).toBe(7 * 60 + 30)
    expect(rows.get('a')!.clockOut).toBe('04:00')
  })
})

describe('Mehrere Stempelsätze an einem Tag', () => {
  it('bewertet Pausenanspruch über den ganzen Tag, nicht je Zeile', () => {
    // 4 Std + 5 Std auf zwei Projekte: einzeln je unter 6 Std, zusammen 9 Std.
    const { rows } = applyWorkTimeRules([
      row({ id: 'a', order: 0, clockIn: '07:00', clockOut: '11:00' }),
      row({ id: 'b', order: 1, clockIn: '11:00', clockOut: '16:00' })
    ])
    const a = rows.get('a')!
    const b = rows.get('b')!
    expect(a.pauseMinutes + b.pauseMinutes).toBe(45)
    // Die längere Zeile trägt die Pause.
    expect(b.pauseMinutes).toBe(45)
    expect(a.workMinutes + b.workMinutes).toBe(8 * 60 + 15)
    // Beide Gehen-Zeiten bleiben stehen, es wurde nur Pause ergänzt.
    expect(a.clockOut).toBe('11:00')
    expect(b.clockOut).toBe('16:00')
  })

  it('kürzt bei der 10-Std-Grenze von hinten', () => {
    const { rows } = applyWorkTimeRules([
      row({ id: 'a', order: 0, clockIn: '05:00', clockOut: '11:00' }),
      row({ id: 'b', order: 1, clockIn: '11:00', clockOut: '18:00' })
    ])
    const a = rows.get('a')!
    const b = rows.get('b')!
    expect(a.workMinutes + b.workMinutes).toBe(MAX_DAILY_WORK_MINUTES)
    // Die frühere Zeile bleibt vollständig erhalten.
    expect(a.workMinutes).toBe(6 * 60)
    expect(b.workMinutes).toBe(4 * 60)
  })

  it('trennt Tage sauber voneinander', () => {
    const { days } = applyWorkTimeRules([
      row({ id: 'a', dateKey: '2026-03-02', clockIn: '07:00', clockOut: '15:00' }),
      row({ id: 'b', dateKey: '2026-03-03', clockIn: '07:00', clockOut: '15:00' })
    ])
    expect(days).toHaveLength(2)
    expect(days.map((d) => d.legalWorkMinutes)).toEqual([450, 450])
  })
})

describe('Unveränderliche Zeilen', () => {
  it('reicht Urlaubszeilen unangetastet durch', () => {
    const { rows, days } = applyWorkTimeRules([
      row({ id: 'urlaub', isFixed: true, clockIn: '', clockOut: '', pauseMinutes: 0 })
    ])
    expect(rows.get('urlaub')!.pauseMinutes).toBe(0)
    expect(rows.get('urlaub')!.adjustments).toEqual([])
    expect(days).toHaveLength(0)
  })

  it('lässt noch laufende Stempelsätze ohne Gehen-Zeit in Ruhe', () => {
    const { rows } = applyWorkTimeRules([row({ id: 'offen', clockOut: '' })])
    expect(rows.get('offen')!.workMinutes).toBe(0)
    expect(rows.get('offen')!.adjustments).toEqual([])
  })
})

describe('Fahrtzeit-Gutschrift', () => {
  it('zählt für Pausenanspruch und Arbeitszeit mit', () => {
    // 5:45 Anwesenheit + 30 Min Gutschrift = 6:15 → Pausenanspruch ausgelöst.
    const { rows } = applyWorkTimeRules([
      row({ id: 'a', clockIn: '07:00', clockOut: '12:45', creditMinutes: 30 })
    ])
    const result = rows.get('a')!
    expect(result.pauseMinutes).toBe(30)
    expect(result.workMinutes).toBe(5 * 60 + 45)
  })
})

describe('Regelarbeitszeit-Deckelung', () => {
  it('weist nur die Regelarbeitszeit aus und verkürzt die Gehen-Zeit', () => {
    const { rows, days } = applyWorkTimeRules(
      [row({ id: 'a', clockIn: '06:00', clockOut: '16:45' })],
      { regularDayMinutes: 510 }
    )
    const result = rows.get('a')!
    expect(result.workMinutes).toBe(510)
    expect(result.pauseMinutes).toBe(45)
    expect(result.clockOut).toBe('15:15')
    expect(result.adjustments).toContain('regular-cap')
    // Der Überhang bleibt als Überstunde stehen und geht nirgends verloren.
    expect(days[0].legalWorkMinutes).toBe(600)
    expect(days[0].overtimeMinutes).toBe(90)
  })

  it('lässt kurze Tage unverändert', () => {
    const { rows, days } = applyWorkTimeRules(
      [row({ id: 'a', clockIn: '08:00', clockOut: '14:00' })],
      { regularDayMinutes: 510 }
    )
    expect(rows.get('a')!.workMinutes).toBe(5 * 60 + 30)
    expect(days[0].overtimeMinutes).toBe(0)
    expect(days[0].extraHeadroomMinutes).toBe(MAX_DAILY_WORK_MINUTES - 330)
  })
})

describe('Überstunden-Auszahlung', () => {
  const days = () =>
    applyWorkTimeRules(
      [
        row({ id: 'mo', dateKey: '2026-03-02', clockIn: '06:00', clockOut: '16:45' }),
        row({ id: 'di', dateKey: '2026-03-03', clockIn: '07:00', clockOut: '16:00' }),
        row({ id: 'mi', dateKey: '2026-03-04', clockIn: '08:00', clockOut: '14:00' })
      ],
      { regularDayMinutes: 510 }
    ).days

  it('verteilt zuerst auf die Tage mit dem größten Überhang', () => {
    // Mo: 10:00 legal → 1:30 Überhang. Di: 8:15 legal → kein Überhang.
    const allocation = allocateOvertimePayout(days(), 60)
    expect(allocation.byDate.get('2026-03-02')).toBe(60)
    expect(allocation.byDate.has('2026-03-03')).toBe(false)
    expect(allocation.allocatedMinutes).toBe(60)
    expect(allocation.beyondActualMinutes).toBe(0)
    expect(allocation.unallocatedMinutes).toBe(0)
  })

  it('füllt darüber hinaus bis zur 10-Std-Grenze auf und weist das aus', () => {
    const allocation = allocateOvertimePayout(days(), 210)
    expect(allocation.byDate.get('2026-03-02')).toBe(90)
    expect(allocation.allocatedMinutes).toBe(210)
    // 90 Min echter Überhang, der Rest geht über die gestempelte Zeit hinaus.
    expect(allocation.beyondActualMinutes).toBe(120)
  })

  it('meldet, was nicht mehr unterzubringen ist', () => {
    const allocation = allocateOvertimePayout(days(), 100 * 60)
    expect(allocation.unallocatedMinutes).toBeGreaterThan(0)
    // Kein Tag darf über die gesetzliche Höchstarbeitszeit hinauswachsen.
    const { days: after } = applyWorkTimeRules(
      [
        row({ id: 'mo', dateKey: '2026-03-02', clockIn: '06:00', clockOut: '16:45' }),
        row({ id: 'di', dateKey: '2026-03-03', clockIn: '07:00', clockOut: '16:00' }),
        row({ id: 'mi', dateKey: '2026-03-04', clockIn: '08:00', clockOut: '14:00' })
      ],
      { regularDayMinutes: 510, payoutByDate: allocation.byDate }
    )
    for (const day of after) {
      expect(day.shownWorkMinutes).toBeLessThanOrEqual(MAX_DAILY_WORK_MINUTES)
    }
  })

  it('schlägt die Auszahlung auf die Zeilen auf und passt die Pause neu an', () => {
    const allocation = allocateOvertimePayout(days(), 60)
    const { rows } = applyWorkTimeRules(
      [row({ id: 'mo', dateKey: '2026-03-02', clockIn: '06:00', clockOut: '16:45' })],
      { regularDayMinutes: 510, payoutByDate: allocation.byDate }
    )
    const result = rows.get('mo')!
    expect(result.workMinutes).toBe(510 + 60)
    expect(result.pauseMinutes).toBe(45)
    expect(result.clockOut).toBe('16:15')
    expect(result.adjustments).toContain('overtime-payout')
  })

  it('hebt die Pause an, wenn die Auszahlung den Tag über 9 Std hebt', () => {
    // 6:30 Anwesenheit → 30 Min Pause → 6:00 Arbeitszeit. Mit 2:30 Auszahlung
    // sind es 8:30 Zielzeit; die Anwesenheit steigt damit auf 9:15 und
    // verlangt 45 statt 30 Min Pause.
    const { rows } = applyWorkTimeRules([row({ id: 'a', clockIn: '07:00', clockOut: '13:30' })], {
      regularDayMinutes: 510,
      payoutByDate: new Map([['2026-03-02', 150]])
    })
    const result = rows.get('a')!
    expect(result.workMinutes).toBe(8 * 60 + 30)
    expect(result.pauseMinutes).toBe(45)
    expect(result.clockOut).toBe('16:15')
    expect(result.adjustments).toContain('overtime-payout')
  })
})

describe('Widerspruchsfreiheit des Ausdrucks', () => {
  it('trägt jede ausgewiesene Anwesenheit ihre eigene Pause', () => {
    // Für den Nachweis muss immer gelten: Gehen − Kommen ergibt eine
    // Anwesenheit, die die ausgewiesene Pause auch wirklich verlangt.
    for (let attendance = 0; attendance <= 14 * 60; attendance += 5) {
      for (const stampedPause of [0, 15, 30, 40, 45, 90]) {
        for (const regular of [null, 480, 510]) {
          for (const payout of [0, 45, 150]) {
            const { rows } = applyWorkTimeRules(
              [
                row({
                  id: 'a',
                  clockIn: '05:00',
                  clockOut: addMinutesToClock('05:00', attendance),
                  pauseMinutes: stampedPause
                })
              ],
              { regularDayMinutes: regular, payoutByDate: new Map([['2026-03-02', payout]]) }
            )
            const result = rows.get('a')!
            const shownAttendance = grossMinutesFromParts('05:00', result.clockOut)
            expect(result.pauseMinutes).toBeGreaterThanOrEqual(
              requiredBreakMinutes(shownAttendance)
            )
            expect(shownAttendance - result.pauseMinutes).toBe(result.workMinutes)
            expect(result.workMinutes).toBeLessThanOrEqual(MAX_DAILY_WORK_MINUTES)
          }
        }
      }
    }
  })
})

describe('Eingabe-Parser', () => {
  it('versteht Stunden:Minuten, Dezimalwerte und Komma', () => {
    expect(parseHoursMinutesInput('8:30')).toBe(510)
    expect(parseHoursMinutesInput('8,5')).toBe(510)
    expect(parseHoursMinutesInput('8.5')).toBe(510)
    expect(parseHoursMinutesInput('2')).toBe(120)
    expect(parseHoursMinutesInput('0:45')).toBe(45)
  })

  it('weist Unsinn zurück', () => {
    expect(parseHoursMinutesInput('')).toBeNull()
    expect(parseHoursMinutesInput('abc')).toBeNull()
    expect(parseHoursMinutesInput('-1')).toBeNull()
    expect(parseHoursMinutesInput('8:75')).toBeNull()
  })
})
