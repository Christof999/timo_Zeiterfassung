import { describe, it, expect } from 'vitest'
import { buildSettlementNote, buildSettlementSummaryLines } from './printHtml'
import { formatCurrency, type ReportSettlementSummary } from './reportUtils'

/** Abrechnung eines Monats mit 129:20 Std Arbeit und 4 Urlaubstagen (30 Std). */
const summary = (overrides: Partial<ReportSettlementSummary> = {}): ReportSettlementSummary => ({
  workMinutes: 129 * 60 + 20,
  settledWorkMinutes: null,
  overtimeAccountDeltaMinutes: 0,
  workAmount: 3104,
  openOvertimeMinutes: 36 * 60 + 12,
  mealAllowanceDays: 11,
  mealAllowanceRate: 14,
  mealAllowanceAmount: 154,
  vacationDays: 4,
  vacationMinutes: 30 * 60,
  vacationAmount: 720,
  holidayMinutes: 0,
  holidayAmount: 0,
  sickDays: 0,
  sickMinutes: 0,
  sickAmount: 0,
  schoolDays: 0,
  schoolMinutes: 0,
  schoolAmount: 0,
  hourlyRate: 24,
  grossWageAmount: 3104,
  grossWageMinutes: 129 * 60 + 20,
  taxFreeAmount: 154,
  totalPayoutAmount: 3258,
  isFixedSalary: false,
  ...overrides
})

const zeile = (label: string, lines = buildSettlementSummaryLines(summary())) =>
  lines.find((line) => line.label === label)

describe('buildSettlementSummaryLines', () => {
  it('weist die Urlaubstage mit ihren Stunden aus', () => {
    // Die Stunden stehen so auch im Nachweis darüber (8 Std Mo–Do, 6 Std Fr).
    // Ohne sie muss die Lohnbuchhaltung die Differenz zur Summe des Blatts
    // selbst zusammensuchen.
    expect(zeile('Urlaubstage')?.detail).toBe(
      '4 Tage (30,00 Std) – Abrechnung im Baulohn, nicht im Bruttolohn enthalten'
    )
  })

  it('lässt den Urlaub ohne Betrag – der Baulohn zahlt ihn über die Urlaubskasse', () => {
    expect(zeile('Urlaubstage')?.amount).toBe('—')
    expect(zeile('Urlaubstage')?.isNote).toBe(true)
  })

  it('rechnet den Urlaub nicht in den Bruttolohn', () => {
    const brutto = zeile('Bruttolohn (steuer- und SV-pflichtig)')
    expect(brutto?.detail).toBe(`129,33 Std × ${formatCurrency(24)}`)
    expect(brutto?.amount).toBe(formatCurrency(3104))
  })

  it('rechnet die geleisteten Stunden mit dem Kostensatz der Mitarbeiterkarte', () => {
    expect(zeile('Geleistete Arbeitsstunden')?.detail).toBe(`129,33 Std × ${formatCurrency(24)}`)
  })
})

describe('Abrechnung mit übernommener Meldung', () => {
  /** 112:00 geleistet, 100:00 gemeldet – 12:00 gehen aufs Überstundenkonto. */
  const gemeldet = summary({
    workMinutes: 112 * 60,
    settledWorkMinutes: 100 * 60,
    overtimeAccountDeltaMinutes: 12 * 60,
    workAmount: 2400,
    grossWageMinutes: 100 * 60,
    grossWageAmount: 2400
  })

  it('zeigt geleistet, abzurechnen und die Kontobewegung getrennt', () => {
    const lines = buildSettlementSummaryLines(gemeldet)
    expect(zeile('Geleistete Arbeitsstunden', lines)).toMatchObject({
      detail: '112,00 Std',
      amount: '—'
    })
    expect(zeile('Davon abzurechnen', lines)).toMatchObject({
      detail: `100,00 Std × ${formatCurrency(24)}`,
      amount: formatCurrency(2400)
    })
    expect(zeile('Aufs Überstundenkonto', lines)?.detail).toBe('12,00 Std')
  })

  it('nennt eine Auszahlung vom Konto beim Namen', () => {
    const lines = buildSettlementSummaryLines(
      summary({ settledWorkMinutes: 140 * 60, overtimeAccountDeltaMinutes: -(10 * 60 + 40) })
    )
    expect(zeile('Vom Überstundenkonto ausgezahlt', lines)?.detail).toBe('10,67 Std')
    expect(zeile('Aufs Überstundenkonto', lines)).toBeUndefined()
  })

  it('schreibt den Vermerk für den Nachweis', () => {
    expect(buildSettlementNote(gemeldet)).toBe(
      'Geleistete Arbeitsstunden: 112,00 Std · davon abzurechnen: 100,00 Std · aufs Überstundenkonto: 12,00 Std'
    )
  })

  it('lässt den Vermerk ohne Meldung weg', () => {
    expect(buildSettlementNote(summary())).toBeNull()
    expect(buildSettlementNote(undefined)).toBeNull()
  })
})
