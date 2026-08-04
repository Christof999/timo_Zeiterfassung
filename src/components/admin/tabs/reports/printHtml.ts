import type { TimeEntry } from '../../../../types'
import { getBavariaHolidayName } from '../../../../utils/bavariaHolidays'
import { roundTimeToStep } from '../../../../utils/timeRounding'
import {
  type AdjustedReportEntry,
  type ReportSettlementSummary,
  calculateWorkHours,
  convertToDate,
  enumerateDays,
  escapeHtml,
  formatCurrency,
  formatDateForDisplay,
  formatNotesForPrintHtml,
  formatTimeForInput,
  getDateKey,
  getWeekEnd,
  getWeekStart,
  isWeekendDate,
  minutesToHoursLabel,
  msToMinutes,
  parseDateInputAsLocalDate
} from './reportUtils'

// HTML-Erzeugung für die Druckansichten (Arbeitszeitnachweis, Mitarbeiter-Auszug).
// Reine String-Bausteine ohne Komponenten-State — die aufrufende Komponente
// kümmert sich um Popup-Fenster, Toasts und Print-Lifecycle.

export interface EmployeePrintRow {
  id: string
  date: Date
  dateKey: string
  dateLabel: string
  projectName: string
  clockIn: string
  clockOut: string
  pauseMinutes: number | null
  notes: string
  workHours: string
  workMinutes: number
  holidayName: string | null
  isWeekend: boolean
  isVacation: boolean
  isEmpty: boolean
}

const buildPrintDateCellHtml = (row: EmployeePrintRow): string => {
  const notes: string[] = []
  if (row.isWeekend) notes.push('Wochenende')
  if (row.holidayName) notes.push(`Feiertag: ${row.holidayName}`)
  if (notes.length === 0) return escapeHtml(row.dateLabel)
  return `${escapeHtml(row.dateLabel)}<br /><span class="day-subnote">${escapeHtml(notes.join(' · '))}</span>`
}

export const buildEmployeePrintRows = (
  reportEntries: AdjustedReportEntry[],
  startDate: string,
  endDate: string
): EmployeePrintRow[] => {
  const selectedStart = parseDateInputAsLocalDate(startDate)
  const selectedEnd = parseDateInputAsLocalDate(endDate)
  const fallbackDates = reportEntries
    .map((entry) => entry.dateRaw)
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime())
  const firstDate = selectedStart || fallbackDates[0]
  const lastDate = selectedEnd || fallbackDates[fallbackDates.length - 1]
  if (!firstDate || !lastDate) return []

  const weekStart = getWeekStart(firstDate)
  const weekEnd = getWeekEnd(lastDate)
  const entriesByDate = new Map<string, AdjustedReportEntry[]>()
  for (const entry of reportEntries) {
    if (!entry.dateRaw) continue
    const dateKey = entry.dateKey || getDateKey(entry.dateRaw)
    const list = entriesByDate.get(dateKey) || []
    list.push(entry)
    entriesByDate.set(dateKey, list)
  }

  const rows: EmployeePrintRow[] = []
  for (const date of enumerateDays(weekStart, weekEnd)) {
    const dateKey = getDateKey(date)
    const dateLabel = formatDateForDisplay(date)
    const holidayName = getBavariaHolidayName(date)
    const isWeekend = isWeekendDate(date)
    const entriesForDay = entriesByDate.get(dateKey) || []

    if (entriesForDay.length > 0) {
      entriesForDay.forEach((entry, index) => {
        const notes = [
          entry.notes,
          holidayName ? `Feiertag: ${holidayName}` : '',
          isWeekend ? 'Wochenende' : ''
        ]
          .map((value) => value.trim())
          .filter(Boolean)
          .join('\n')
        // Ausgewiesen wird die gesetzlich korrigierte Sicht: Pause auf dem
        // Mindestmaß, Gehen-Zeit passend zur gedeckelten bzw. um ausbezahlte
        // Überstunden ergänzten Arbeitszeit.
        rows.push({
          id: `${entry.id}-${index}`,
          date,
          dateKey,
          dateLabel,
          projectName: entry.projectName,
          clockIn: entry.clockIn || '—',
          clockOut: entry.effectiveClockOut || '—',
          // Urlaub, Feiertag und Krankheit haben keine Stempelzeiten – dort
          // wäre eine „0" als Pausenangabe irreführend.
          pauseMinutes: entry.clockIn ? entry.effectivePauseMinutes : null,
          notes,
          workHours: entry.effectiveWorkHours || '0:00',
          workMinutes: entry.effectiveWorkMinutes,
          holidayName,
          isWeekend,
          isVacation: entry.source === 'leave-request',
          isEmpty: false
        })
      })
      continue
    }

    const notes = [
      holidayName ? `Feiertag: ${holidayName}` : '',
      isWeekend ? 'Wochenende' : ''
    ].filter(Boolean)

    rows.push({
      id: `empty-${dateKey}`,
      date,
      dateKey,
      dateLabel,
      projectName: holidayName ? 'Feiertag' : isWeekend ? 'Wochenende' : '—',
      clockIn: '—',
      clockOut: '—',
      pauseMinutes: null,
      notes: notes.join('\n'),
      workHours: '0:00',
      workMinutes: 0,
      holidayName,
      isWeekend,
      isVacation: false,
      isEmpty: true
    })
  }

  return rows
}

export const calculateEmployeePrintTotalHours = (rows: EmployeePrintRow[]): string =>
  minutesToHoursLabel(rows.reduce((sum, row) => sum + row.workMinutes, 0))

/**
 * Der Abrechnungsblock, den Petra an die Lohnbuchhaltung meldet. Bewusst als
 * eigene Tabelle unter dem Nachweis, damit beides auf einem Blatt steht.
 */
const buildSettlementSummaryHtml = (summary: ReportSettlementSummary): string => {
  const hours = (minutes: number): string => `${minutesToHoursLabel(minutes)} Std`
  const rate = formatCurrency(summary.hourlyRate)

  interface SummaryLine {
    label: string
    detail: string
    amount: string
    /** Summenzeile – hervorgehoben und mit Trennlinie darüber */
    isTotal?: boolean
    /** Nachrichtlich, gehört nicht zur Meldung an den Steuerberater */
    isNote?: boolean
  }

  // Reihenfolge ist bewusst: erst alle lohnwirksamen Posten, dann der Bruttolohn.
  // Beim Fixlohn (Azubi) steht neben den Zeiten kein Stundensatz und kein
  // Zeilenbetrag – vergütet wird pauschal, der Betrag steht erst in der Summe.
  const fixed = summary.isFixedSalary
  const amountOrDash = (value: number): string => (fixed ? '—' : formatCurrency(value))
  const timesRate = (label: string): string => (fixed ? label : `${label} × ${rate}`)

  const lines: SummaryLine[] = [
    {
      label: 'Geleistete Arbeitsstunden',
      detail: timesRate(hours(summary.workMinutes)),
      amount: amountOrDash(summary.workAmount)
    },
    {
      label: 'Urlaubsstunden',
      detail: timesRate(hours(summary.vacationMinutes)),
      amount: amountOrDash(summary.vacationAmount)
    },
    {
      label: 'Feiertagsstunden',
      detail: timesRate(hours(summary.holidayMinutes)),
      amount: amountOrDash(summary.holidayAmount)
    },
    {
      label: 'Krankheitstage',
      detail: timesRate(`${summary.sickDays} Tage (${hours(summary.sickMinutes)})`),
      amount: amountOrDash(summary.sickAmount)
    },
    {
      label: fixed ? 'Fixlohn (steuer- und SV-pflichtig)' : 'Bruttolohn (steuer- und SV-pflichtig)',
      detail: fixed
        ? 'Monatliche Ausbildungsvergütung'
        : `${hours(summary.grossWageMinutes)} × ${rate}`,
      amount: formatCurrency(summary.grossWageAmount),
      isTotal: true
    },
    {
      label: 'Verpflegungsmehraufwand (steuerfrei)',
      detail: `${summary.mealAllowanceDays} Tage × ${formatCurrency(summary.mealAllowanceRate)}`,
      amount: formatCurrency(summary.mealAllowanceAmount)
    },
    {
      label: 'Auszahlung gesamt',
      detail: `${fixed ? 'Fixlohn' : 'Bruttolohn'} + steuerfreie Zuwendungen`,
      amount: formatCurrency(summary.totalPayoutAmount),
      isTotal: true
    },
    {
      label: 'Nicht abgerechnete Überstunden',
      detail: hours(summary.openOvertimeMinutes),
      amount: '—',
      isNote: true
    }
  ]

  const rowsHtml = lines
    .map((line) => {
      const classes = [line.isTotal ? 'summary-total' : '', line.isNote ? 'summary-note' : '']
        .filter(Boolean)
        .join(' ')
      return `<tr${classes ? ` class="${classes}"` : ''}>
  <td>${escapeHtml(line.label)}</td>
  <td>${escapeHtml(line.detail)}</td>
  <td class="right">${escapeHtml(line.amount)}</td>
</tr>`
    })
    .join('')

  return `<h2 class="summary-title">Abrechnung</h2>
<table class="summary-table">
  <thead>
    <tr><th>Position</th><th>Berechnung</th><th class="right">Summe</th></tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>`
}

/** Unterschriftenfelder – jeder Bericht muss von beiden Seiten gezeichnet sein. */
const buildSignatureHtml = (employeeName: string, companyName: string): string =>
  `<div class="signatures">
  <div class="signature-box">
    <div class="signature-line"></div>
    <p>${escapeHtml(employeeName || 'Mitarbeiter')}</p>
  </div>
  <div class="signature-box">
    <div class="signature-line"></div>
    <p>${escapeHtml(companyName)}</p>
  </div>
</div>`

/** Arbeitszeitnachweis eines Mitarbeiters als eigenständiges Druck-HTML. */
export const COMPANY_NAME = 'Fliesen Reislöhner'

export const buildEmployeePrintHtml = (params: {
  reportEntries: AdjustedReportEntry[]
  startDate: string
  endDate: string
  employeeName: string
  periodLabel: string
  /** z. B. "Mo–Do 8:00 · Fr 6:00" – gesetzt, wenn nur die Regelarbeitszeit ausgewiesen wird */
  regularWorkTimeLabel?: string | null
  /** ausbezahlte und damit in den Zeilen enthaltene Überstunden */
  payoutMinutes?: number
  /** true, wenn im Bericht Pausen ergänzt oder auf 10 Std gedeckelt wurde */
  hasLegalCorrection?: boolean
  /** Summenblock für die Lohnabrechnung */
  summary?: ReportSettlementSummary
  companyName?: string
}): string => {
  const printRows = buildEmployeePrintRows(params.reportEntries, params.startDate, params.endDate)
  const company = params.companyName || COMPANY_NAME

  const metaExtras: string[] = []
  if (params.regularWorkTimeLabel) {
    metaExtras.push(
      `<div><strong>Regelarbeitszeit:</strong> ${escapeHtml(params.regularWorkTimeLabel)}</div>`
    )
  }
  if (params.payoutMinutes) {
    metaExtras.push(
      `<div><strong>Ausbezahlte Überstunden:</strong> ${escapeHtml(minutesToHoursLabel(params.payoutMinutes))} Std (in den Zeiten enthalten)</div>`
    )
  }

  const footnotes: string[] = []
  if (params.hasLegalCorrection) {
    footnotes.push(
      'Pausen sind nach §4 ArbZG ausgewiesen (ab 6 Std 30 Min, ab 9 Std 45 Min) und auf die Anwesenheit aufgeschlagen; die tägliche Arbeitszeit ist auf 10 Std begrenzt.'
    )
  }
  if (params.regularWorkTimeLabel) {
    footnotes.push(
      'Über die Regelarbeitszeit hinaus geleistete Zeit ist nicht ausgewiesen, sondern dem Überstundenkonto gutgeschrieben.'
    )
  }
  const footnoteHtml = footnotes.length
    ? `<p class="footnote">${footnotes.map((note) => escapeHtml(note)).join('<br />')}</p>`
    : ''

  const summaryHtml = params.summary ? buildSettlementSummaryHtml(params.summary) : ''
  const rowsHtml = printRows
    .map((row) => {
      const classes = [
        row.isWeekend ? 'weekend-row' : '',
        row.holidayName ? 'holiday-row' : '',
        row.isVacation ? 'vacation-row' : '',
        row.isEmpty ? 'empty-row' : ''
      ].filter(Boolean).join(' ')
      return `<tr>
  <td class="date-print-cell ${classes}">${buildPrintDateCellHtml(row)}</td>
  <td>${escapeHtml(row.projectName)}</td>
  <td>${escapeHtml(row.clockIn)}</td>
  <td>${escapeHtml(row.clockOut)}</td>
  <td>${row.pauseMinutes ?? '—'}</td>
  <td class="doc-cell">${formatNotesForPrintHtml(row.notes)}</td>
  <td>${escapeHtml(row.workHours)}</td>
</tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Arbeitszeitnachweis</title>
  <style>
    body {
      margin: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #222;
      background: #fff;
    }
    .meta {
      margin-bottom: 16px;
      line-height: 1.45;
      font-size: 14px;
    }
    .meta strong {
      display: inline-block;
      min-width: 110px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #d6d6d6;
      padding: 8px 10px;
      text-align: left;
      vertical-align: middle;
    }
    td.doc-cell {
      vertical-align: top;
      white-space: normal;
      word-break: break-word;
      max-width: 280px;
      font-size: 12px;
      line-height: 1.4;
    }
    th {
      background: #f4f4f4;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    tfoot td {
      font-weight: 700;
      background: #fafafa;
    }
    .right {
      text-align: right;
    }
    .doc-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #222;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .doc-head .company {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .doc-head .employee {
      font-size: 15px;
      font-weight: 600;
    }
    .summary-title {
      font-size: 15px;
      margin: 22px 0 8px;
    }
    .summary-table {
      page-break-inside: avoid;
    }
    .summary-table tbody tr:last-child td {
      border-bottom: 1px solid #d6d6d6;
    }
    .summary-table tr.summary-total td {
      font-weight: 700;
      border-top: 2px solid #222;
    }
    .summary-table tr.summary-note td {
      color: #555;
    }
    .signatures {
      display: flex;
      gap: 48px;
      margin-top: 42px;
      page-break-inside: avoid;
    }
    .signatures .signature-box {
      flex: 1 1 0;
    }
    .signatures .signature-line {
      border-top: 1px solid #222;
      margin-bottom: 6px;
    }
    .signatures p {
      margin: 0;
      font-size: 12px;
      color: #333;
    }
    .footnote {
      margin-top: 14px;
      color: #555;
      font-size: 11px;
      line-height: 1.5;
    }
    .day-subnote {
      display: inline-block;
      margin-top: 2px;
      color: #555;
      font-size: 11px;
      line-height: 1.25;
    }
    .date-print-cell.weekend-row,
    tr:has(.date-print-cell.weekend-row) {
      background: #f8f8f8;
    }
    .date-print-cell.holiday-row,
    tr:has(.date-print-cell.holiday-row) {
      background: #fff7df;
    }
    .date-print-cell.vacation-row,
    tr:has(.date-print-cell.vacation-row) {
      background: #eaf5ea;
    }
    @page {
      margin: 12mm;
      size: A4 portrait;
    }
  </style>
</head>
<body>
  <div class="doc-head">
    <div class="company">${escapeHtml(company)}</div>
    <div class="employee">${escapeHtml(params.employeeName || '-')}</div>
  </div>

  <div class="meta">
    <div><strong>Zeitraum:</strong> ${escapeHtml(params.periodLabel)}</div>
    ${metaExtras.join('\n    ')}
  </div>

  <table>
    <thead>
      <tr>
        <th>Tag</th>
        <th>Projekt</th>
        <th>Kommen</th>
        <th>Gehen</th>
        <th>Pause</th>
        <th>Dokumentation</th>
        <th>Arbeitszeit</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6">Gesamt:</td>
        <td class="right">${escapeHtml(calculateEmployeePrintTotalHours(printRows))}</td>
      </tr>
    </tfoot>
  </table>
  ${summaryHtml}
  ${footnoteHtml}
  ${buildSignatureHtml(params.employeeName, company)}
</body>
</html>`
}

/** Mitarbeiter-Auszug eines Projekts (ohne Kosten/Bilder) als Druck-HTML. */
export const buildProjectStaffPrintHtml = (params: {
  entries: TimeEntry[]
  projectName: string
  periodLabel: string
  getEmployeeDisplayName: (employeeId: string) => string
}): string => {
  const esc = escapeHtml

  const timeRows = params.entries
    .filter(e => e.clockOutTime)
    .sort((a, b) => {
      const ta = convertToDate(a.clockInTime)?.getTime() || 0
      const tb = convertToDate(b.clockInTime)?.getTime() || 0
      return ta - tb
    })
    .map(e => {
      const cin = convertToDate(e.clockInTime)
      const cout = convertToDate(e.clockOutTime)
      const dateStr = cin ? cin.toLocaleDateString('de-DE') : '-'
      // Zeiten auf 15-Min-Raster glätten (Anzeige + Stundenberechnung)
      const tIn = formatTimeForInput(roundTimeToStep(cin))
      const tOut = formatTimeForInput(roundTimeToStep(cout))
      const pauseMin = msToMinutes(e.pauseTotalTime || 0)
      const wh = calculateWorkHours(tIn, tOut, pauseMin)
      const name = params.getEmployeeDisplayName(e.employeeId)
      return `<tr>
  <td>${esc(dateStr)}</td>
  <td>${esc(name)}</td>
  <td>${esc(tIn)}</td>
  <td>${esc(tOut)}</td>
  <td class="right">${pauseMin}</td>
  <td class="right">${esc(wh)}</td>
  <td>${esc((e.notes || '').trim())}</td>
</tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Mitarbeiter-Auszug</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #222; }
    h1 { font-size: 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f4f4; }
    .right { text-align: right; }
    .muted { color: #555; font-size: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>${esc(params.projectName)}</h1>
  <p class="muted">Gebuchte Zeiten (ohne Stundensätze, ohne Gesamtkosten, ohne Bilder). Zeitraum: ${esc(params.periodLabel)}</p>
  <h2>Zeiten</h2>
  <table>
    <thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Kommen</th><th>Gehen</th><th>Pause (min)</th><th>Arbeitszeit</th><th>Kommentar</th></tr></thead>
    <tbody>${timeRows || '<tr><td colspan="7">Keine Zeiten</td></tr>'}</tbody>
  </table>
</body>
</html>`
}
