import type { TimeEntry } from '../../../../types'
import { getBavariaHolidayName } from '../../../../utils/bavariaHolidays'
import { roundTimeToStep } from '../../../../utils/timeRounding'
import {
  type ReportEntry,
  calculateWorkHours,
  convertToDate,
  enumerateDays,
  escapeHtml,
  formatDateForDisplay,
  formatNotesForPrintHtml,
  formatTimeForInput,
  getDateKey,
  getWeekEnd,
  getWeekStart,
  isWeekendDate,
  minutesToHoursLabel,
  msToMinutes,
  parseDateInputAsLocalDate,
  workMinutesFromReportEntry
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
  reportEntries: ReportEntry[],
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
  const entriesByDate = new Map<string, ReportEntry[]>()
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
        rows.push({
          id: `${entry.id}-${index}`,
          date,
          dateKey,
          dateLabel,
          projectName: entry.projectName,
          clockIn: entry.clockIn || '—',
          clockOut: entry.clockOut || '—',
          pauseMinutes: entry.pauseMinutes,
          notes,
          workHours: entry.workHours || '0:00',
          workMinutes: workMinutesFromReportEntry(entry),
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

/** Arbeitszeitnachweis eines Mitarbeiters als eigenständiges Druck-HTML. */
export const buildEmployeePrintHtml = (params: {
  reportEntries: ReportEntry[]
  startDate: string
  endDate: string
  employeeName: string
  periodLabel: string
}): string => {
  const printRows = buildEmployeePrintRows(params.reportEntries, params.startDate, params.endDate)
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
  <div class="meta">
    <div><strong>Mitarbeiter:</strong> ${escapeHtml(params.employeeName || '-')}</div>
    <div><strong>Zeitraum:</strong> ${escapeHtml(params.periodLabel)}</div>
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
