import type { TimeEntry } from '../../../../types'
import { getBavariaHolidayName } from '../../../../utils/bavariaHolidays'
import { roundTimeToStep } from '../../../../utils/timeRounding'
import {
  type AbsenceKind,
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
  minutesToDecimalHours,
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
  /** gesetzt bei Urlaub, Feiertag, Krankheit und Berufsschule */
  absenceKind?: AbsenceKind
}

/**
 * Arbeitszeit einer Belegzeile.
 *
 * Beim Urlaub steht bewusst KEINE Stundenzahl: der Baulohn rechnet den Urlaub
 * über die Urlaubskasse selbst, gemeldet werden nur die Urlaubstage im
 * Abrechnungsblock. Eine Stundenangabe daneben würde doppelt gelesen.
 */
export const printRowHoursLabel = (row: EmployeePrintRow): string =>
  row.absenceKind === 'vacation' ? '—' : minutesToDecimalHours(row.workMinutes)

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
          // Urlaubsstunden zählen nicht in die Belegsumme – sie werden im
          // Baulohn gesondert abgerechnet.
          workMinutes: entry.absenceKind === 'vacation' ? 0 : entry.effectiveWorkMinutes,
          holidayName,
          isWeekend,
          isVacation: entry.source === 'leave-request',
          isEmpty: false,
          absenceKind: entry.absenceKind
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

/**
 * Beschriftung der Summenzeile. Enthält der Zeitraum Urlaub, wird ausdrücklich
 * gesagt, dass er nicht mitgezählt ist – sonst sucht die Lohnbuchhaltung die
 * fehlenden Stunden.
 */
export const employeePrintTotalLabel = (rows: EmployeePrintRow[]): string =>
  rows.some((row) => row.absenceKind === 'vacation') ? 'Gesamt (ohne Urlaub):' : 'Gesamt:'

/** Gesamtzeit des Belegs – in Dezimalstunden, so rechnet die Lohnbuchhaltung. */
export const calculateEmployeePrintTotalHours = (rows: EmployeePrintRow[]): string =>
  minutesToDecimalHours(rows.reduce((sum, row) => sum + row.workMinutes, 0))

export interface SummaryLine {
  label: string
  detail: string
  amount: string
  /** Summenzeile – hervorgehoben und mit Trennlinie darüber */
  isTotal?: boolean
  /** Nachrichtlich, gehört nicht zur Meldung an den Steuerberater */
  isNote?: boolean
}

/**
 * Zeilen des Abrechnungsblocks, den Petra an die Lohnbuchhaltung meldet.
 * Getrennt von der Darstellung, damit HTML-Ausdruck und PDF-Anhang garantiert
 * dieselben Posten zeigen.
 */
export const buildSettlementSummaryLines = (summary: ReportSettlementSummary): SummaryLine[] => {
  // Die Kanzlei rechnet in Dezimalstunden – „8,50" statt „8:30".
  const hours = (minutes: number): string => `${minutesToDecimalHours(minutes)} Std`
  const days = (anzahl: number): string => `${anzahl} ${anzahl === 1 ? 'Tag' : 'Tage'}`
  const rate = formatCurrency(summary.hourlyRate)

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
      label: 'Feiertagsstunden',
      detail: timesRate(hours(summary.holidayMinutes)),
      amount: amountOrDash(summary.holidayAmount)
    },
    {
      label: 'Krankheitstage',
      detail: timesRate(`${days(summary.sickDays)} (${hours(summary.sickMinutes)})`),
      amount: amountOrDash(summary.sickAmount)
    },
    ...(summary.schoolDays > 0
      ? [
          {
            label: 'Berufsschultage',
            detail: timesRate(`${days(summary.schoolDays)} (${hours(summary.schoolMinutes)})`),
            amount: amountOrDash(summary.schoolAmount)
          }
        ]
      : []),
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
      detail: `${days(summary.mealAllowanceDays)} × ${formatCurrency(summary.mealAllowanceRate)}`,
      amount: formatCurrency(summary.mealAllowanceAmount)
    },
    {
      label: 'Auszahlung gesamt',
      detail: `${fixed ? 'Fixlohn' : 'Bruttolohn'} + steuerfreie Zuwendungen`,
      amount: formatCurrency(summary.totalPayoutAmount),
      isTotal: true
    },
    {
      // Urlaub steht bewusst NACH dem Bruttolohn und ohne Betrag: der Baulohn
      // rechnet ihn über die Urlaubskasse selbst, gemeldet werden nur die Tage.
      label: 'Urlaubstage',
      detail: `${days(summary.vacationDays)} – Abrechnung im Baulohn, nicht im Bruttolohn enthalten`,
      amount: '—',
      isNote: true
    },
    {
      label: 'Nicht abgerechnete Überstunden',
      detail: hours(summary.openOvertimeMinutes),
      amount: '—',
      isNote: true
    }
  ]

  return lines
}

/**
 * Der Abrechnungsblock als HTML – bewusst als eigene Tabelle unter dem
 * Nachweis, damit beides auf einem Blatt steht.
 */
export const buildSettlementSummaryHtml = (summary: ReportSettlementSummary): string => {
  const rowsHtml = buildSettlementSummaryLines(summary)
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

export interface EmployeePrintParams {
  reportEntries: AdjustedReportEntry[]
  startDate: string
  endDate: string
  employeeName: string
  periodLabel: string
  /** z. B. "Mo–Do 8:00 · Fr 6:00" – gesetzt, wenn nur die Regelarbeitszeit ausgewiesen wird */
  regularWorkTimeLabel?: string | null
  /** ausbezahlte und damit in den Zeilen enthaltene Überstunden */
  payoutMinutes?: number
  /** Summenblock für die Lohnabrechnung */
  summary?: ReportSettlementSummary
  companyName?: string
}

/**
 * Nachweis eines Mitarbeiters als Rumpf ohne `<html>`-Gerüst.
 *
 * Getrennt vom vollständigen Dokument, damit derselbe Baustein mehrfach in ein
 * Sammel-Dokument („Alle drucken") gesetzt werden kann – ein Druckauftrag für
 * alle Mitarbeiter, jeder auf einem eigenen Blatt.
 */
const buildEmployeeReportBodyHtml = (
  params: EmployeePrintParams,
  options: {
    /**
     * Name und Zeitraum als erste Kopfzeile der Tabelle. Der `<thead>`
     * wiederholt sich auf jeder Folgeseite – im Sammelausdruck ist das die
     * einzige Stelle, an der auch Seite 3 noch verrät, zu wem sie gehört.
     */
    repeatNameInHeader?: boolean
  } = {}
): string => {
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
      `<div><strong>Ausbezahlte Überstunden:</strong> ${escapeHtml(minutesToDecimalHours(params.payoutMinutes))} Std (in den Zeiten enthalten)</div>`
    )
  }

  // Der Hinweis auf die Pausenregel nach §4 ArbZG steht bewusst nicht mehr auf
  // dem Beleg – auf ausdrücklichen Wunsch, der Ausdruck soll schlank bleiben.
  const footnotes: string[] = []
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
      // Die Dokumentation steht in einer eigenen Zeile über die volle Breite.
      // Als schmale Spalte war sie im Druck nur ~150px breit und machte Zeilen
      // hunderte Pixel hoch – eine solche Zeile passt irgendwann auf keine
      // Seite mehr und wird vom Umbruch zerschnitten. Die Zeile mit den
      // Zeitdaten bleibt so immer niedrig und damit unteilbar.
      const zeitZeile = `<tr class="time-row">
  <td class="date-print-cell ${classes}">${buildPrintDateCellHtml(row)}</td>
  <td>${escapeHtml(row.projectName)}</td>
  <td>${escapeHtml(row.clockIn)}</td>
  <td>${escapeHtml(row.clockOut)}</td>
  <td>${row.pauseMinutes ?? '—'}</td>
  <td>${escapeHtml(printRowHoursLabel(row))}</td>
</tr>`
      const doku = (row.notes || '').trim()
      if (!doku) return zeitZeile
      return `${zeitZeile}
<tr class="doc-row">
  <td colspan="6"><span class="doc-label">Dokumentation:</span> ${formatNotesForPrintHtml(row.notes)}</td>
</tr>`
    })
    .join('')

  return `  <div class="doc-head">
    <div class="company">${escapeHtml(company)}</div>
    <div class="employee">${escapeHtml(params.employeeName || '-')}</div>
  </div>

  <div class="meta">
    <div><strong>Zeitraum:</strong> ${escapeHtml(params.periodLabel)}</div>
    ${metaExtras.join('\n    ')}
  </div>

  <table>
    <colgroup>
      <col style="width: 15%" />
      <col style="width: 31%" />
      <col style="width: 12%" />
      <col style="width: 12%" />
      <col style="width: 10%" />
      <col style="width: 20%" />
    </colgroup>
    <thead>
      ${
        options.repeatNameInHeader
          ? `<tr class="sheet-name"><th colspan="6">${escapeHtml(params.employeeName || '-')} · ${escapeHtml(params.periodLabel)}</th></tr>`
          : ''
      }
      <tr>
        <th>Tag</th>
        <th>Projekt</th>
        <th>Kommen</th>
        <th>Gehen</th>
        <th>Pause</th>
        <th>Arbeitszeit</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">${escapeHtml(employeePrintTotalLabel(printRows))}</td>
        <td class="right">${escapeHtml(calculateEmployeePrintTotalHours(printRows))}</td>
      </tr>
    </tfoot>
  </table>
  <div class="closing">
    ${
      // Der Abrechnungsblock rutscht oft auf ein eigenes Blatt. Im Sammel-
      // ausdruck wäre das sonst ein Blatt ohne Namen.
      options.repeatNameInHeader
        ? `<div class="sheet-owner">${escapeHtml(params.employeeName || '-')} · ${escapeHtml(params.periodLabel)}</div>`
        : ''
    }
    ${summaryHtml}
    ${footnoteHtml}
    ${buildSignatureHtml(params.employeeName, company)}
  </div>`
}

/** Stylesheet des Arbeitszeitnachweises – einmal je Dokument, auch im Sammeldruck. */
const EMPLOYEE_PRINT_CSS = `
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
    /* Ohne diese Regel zerschneidet der Seitenumbruch einzelne Zeilen: die
       obere Hälfte steht auf der einen, die untere auf der nächsten Seite. */
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* Spaltenköpfe auf jeder Folgeseite wiederholen, sonst weiß niemand mehr,
       welche Spalte welche ist. */
    thead {
      display: table-header-group;
    }
    /* Die Gesamt-Zeile gehört ans Ende des Berichts, nicht unter jede Seite. */
    tfoot {
      display: table-row-group;
    }
    th, td {
      border: 1px solid #d6d6d6;
      padding: 8px 10px;
      text-align: left;
      vertical-align: middle;
    }
    /* Zeile mit den Zeitdaten: niedrig und garantiert unteilbar. Sie darf
       auch nicht von ihrer Dokumentation getrennt werden, sonst stünde der Tag
       allein am Seitenfuß. */
    tr.time-row {
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    tr.time-row td {
      white-space: nowrap;
    }
    /* Fließtext darf umbrechen – sonst bliebe am Seitenfuß Platz liegen, nur
       weil eine lange Dokumentation nicht mehr komplett hinpasst. */
    tr.doc-row {
      page-break-inside: auto;
      break-inside: auto;
    }
    tr.time-row td.date-print-cell {
      white-space: normal;
    }
    /* Dokumentation über die volle Breite statt in einer schmalen Spalte. */
    tr.doc-row td {
      vertical-align: top;
      white-space: normal;
      word-break: break-word;
      font-size: 11px;
      line-height: 1.4;
      color: #333;
      border-top: none;
      padding-top: 0;
    }
    .doc-label {
      font-weight: 700;
      color: #555;
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
    /* Überschrift darf nicht allein am Seitenfuß stehenbleiben. */
    .summary-title {
      font-size: 15px;
      margin: 22px 0 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .summary-table {
      page-break-inside: avoid;
      break-inside: avoid;
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
    /* Abrechnung, Fußnote und Unterschriften bleiben zusammen. Sonst rutschen
       die zwei Unterschriftszeilen allein auf eine sonst leere letzte Seite –
       und ein Nachweis, der auf einem Blatt ohne Inhalt gezeichnet wird, taugt
       nichts. Der Block ist deutlich kleiner als eine Seite, wandert also
       notfalls komplett. */
    .closing {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signatures {
      display: flex;
      gap: 48px;
      margin-top: 32px;
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
`

/**
 * Mehrere Nachweise in EINEM Druckauftrag: jeder Mitarbeiter beginnt auf einem
 * neuen Blatt. Ohne diese Regel liefen zwei Berichte auf derselben Seite
 * ineinander – der Ausdruck geht aber je Mitarbeiter in eine eigene Akte.
 */
const BATCH_PRINT_CSS = `
    .employee-sheet + .employee-sheet {
      page-break-before: always;
      break-before: page;
    }
    thead tr.sheet-name th {
      background: #ebebeb;
      font-size: 14px;
      text-align: left;
    }
    .sheet-owner {
      margin: 22px 0 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #222;
      font-size: 13px;
      font-weight: 700;
    }
`

/** Baut das druckfertige HTML-Dokument um einen oder mehrere Berichtsrümpfe. */
const wrapPrintDocument = (title: string, css: string, body: string): string => `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${css}  </style>
</head>
<body>
${body}
</body>
</html>`

export const buildEmployeePrintHtml = (params: EmployeePrintParams): string =>
  wrapPrintDocument('Arbeitszeitnachweis', EMPLOYEE_PRINT_CSS, buildEmployeeReportBodyHtml(params))

/**
 * Sammel-Ausdruck: alle Mitarbeiter des Zeitraums in einem einzigen Dokument,
 * jeder auf einem eigenen Blatt.
 */
export const buildEmployeeBatchPrintHtml = (
  reports: EmployeePrintParams[],
  documentTitle = 'Arbeitszeitnachweise'
): string =>
  wrapPrintDocument(
    documentTitle,
    EMPLOYEE_PRINT_CSS + BATCH_PRINT_CSS,
    reports
      .map(
        (report) =>
          `  <section class="employee-sheet">\n${buildEmployeeReportBodyHtml(report, {
            repeatNameInHeader: true
          })}\n  </section>`
      )
      .join('\n')
  )

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
