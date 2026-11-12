import { describe, expect, it } from 'vitest'
import type { LeaveRequest } from '../../../../types'
import { buildAbsenceReportEntries, buildAdjustedReport, settlementBookingFor } from './reportUtils'
import { buildDatevRows } from './datevReport'
import { buildSettlementSummaryLines } from './printHtml'
import { buildDatevPrintHtml } from './datevPrintHtml'

const leave = (day: number, overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: `leave-${day}`,
  employeeId: 'niko',
  startDate: new Date(2026, 9, day),
  endDate: new Date(2026, 9, day),
  type: 'overtime',
  workingDays: 1,
  status: 'approved',
  ...overrides
})

const octoberAbsences = (requests: LeaveRequest[], occupied = new Set<string>()) =>
  buildAbsenceReportEntries('niko', requests, new Date(2026, 9, 1), new Date(2026, 9, 31), occupied)

describe('Urlaub auf Überstunden im Monatsbericht', () => {
  it('weist Nikos drei Oktobertage mit 20 bezahlten Stunden im DATEV aus', () => {
    const report = buildAdjustedReport(octoberAbsences([leave(23), leave(27), leave(30)]), {
      hourlyRate: 20,
      settledWorkMinutes: 115 * 60,
      overtimeBalanceMinutes: 63 * 60
    })
    const rows = buildDatevRows(report.entries, '2026-10-01', '2026-10-31')
    expect(rows.filter(row => row.key === 'Ü').map(row => ({
      date: row.dateKey, minutes: row.workMinutes, remark: row.remark, begin: row.begin, end: row.end
    }))).toEqual([
      { date: '2026-10-23', minutes: 360, remark: 'Urlaub auf Überstunden', begin: '', end: '' },
      { date: '2026-10-27', minutes: 480, remark: 'Urlaub auf Überstunden', begin: '', end: '' },
      { date: '2026-10-30', minutes: 360, remark: 'Urlaub auf Überstunden', begin: '', end: '' }
    ])
    expect(report.summary).toMatchObject({
      overtimeLeaveDays: 3, overtimeLeaveMinutes: 1200, overtimeLeaveAmount: 400,
      workMinutes: 0, vacationDays: 0, mealAllowanceDays: 0,
      grossWageMinutes: 135 * 60, grossWageAmount: 2700
    })
    const line = buildSettlementSummaryLines(report.summary).find(line => line.label === 'Urlaub auf Überstunden')
    expect(line?.detail.replace(/\s/g, ' ')).toBe('3 Tage (20,00 Std) × 20,00 €')
    expect(line?.amount.replace(/\s/g, ' ')).toBe('400,00 €')
    const html = buildDatevPrintHtml({ rows, employeeName: 'Niko', periodLabel: 'Oktober 2026', summary: report.summary })
    expect(html).toContain('Urlaub auf Überstunden')
    expect(html).toContain('20,00 Std')
  })

  it('zählt Freizeitausgleich nicht als neue Arbeit oder erneute Kontoentnahme', () => {
    const report = buildAdjustedReport(octoberAbsences([leave(23), leave(27), leave(30)]), {
      overtimeBalanceMinutes: 600
    })
    expect(report.summary.workMinutes).toBe(0)
    expect(report.summary.overtimeAccountDeltaMinutes).toBe(0)
    expect(report.summary.openOvertimeMinutes).toBe(600)
    expect(settlementBookingFor(report.summary, null, false)).toBeNull()
  })

  it('berücksichtigt Genehmigung, Stornierung, Wochenenden, Feiertage und Stempelungen', () => {
    const requests = [
      leave(2), leave(3), leave(4), leave(5, { status: 'pending' }),
      leave(6, { status: 'rejected' }), leave(7, { cancelledDates: ['2026-10-07'] }),
      leave(8), leave(9)
    ]
    const entries = octoberAbsences(requests, new Set(['2026-10-08']))
    expect(entries.filter(e => e.absenceKind === 'overtime').map(e => [e.dateKey, e.workHours]))
      .toEqual([['2026-10-02', '6:00'], ['2026-10-09', '6:00']])
  })

  it('trennt normalen Urlaub und bezahlt bei Fixlohn weiterhin nur den Fixlohn', () => {
    const report = buildAdjustedReport(octoberAbsences([leave(23), leave(27, { type: 'vacation' })]), {
      isApprentice: true, fixedMonthlySalary: 1000, hourlyRate: 20
    })
    expect(report.summary).toMatchObject({
      vacationDays: 1, overtimeLeaveDays: 1, overtimeLeaveMinutes: 360,
      overtimeLeaveAmount: 0, grossWageAmount: 1000, mealAllowanceDays: 0
    })
  })
})
