import { escapeHtml, minutesToDecimalHours, type ReportSettlementSummary } from './reportUtils'
import { DATEV_KEY_LEGEND, datevTotalMinutes, type DatevDayRow } from './datevReport'
import { buildSettlementSummaryHtml, COMPANY_NAME } from './printHtml'

/**
 * Druck-HTML im Aufbau der DATEV-Vorlage „Dokumentation der täglichen
 * Arbeitszeit": eine Zeile je Kalendertag, keine Projekte, keine
 * Dokumentation. Bewusst schlank – das Blatt wird unterschrieben und geht so
 * an die Lohnbuchhaltung.
 */
export interface DatevPrintParams {
  rows: DatevDayRow[]
  employeeName: string
  personnelNumber?: string
  /** z. B. "Juli 2026" */
  periodLabel: string
  companyName?: string
  /** Abrechnungsblock – kommt auf ein eigenes Blatt hinter den Nachweis. */
  summary?: ReportSettlementSummary
}

/**
 * Nachweis eines Mitarbeiters als Rumpf ohne `<html>`-Gerüst – damit derselbe
 * Baustein mehrfach in ein Sammel-Dokument („Alle drucken") passt.
 */
const buildDatevBodyHtml = (params: DatevPrintParams): string => {
  const company = params.companyName || COMPANY_NAME
  const esc = escapeHtml
  // Dezimalstunden statt 0:45 – die Lohnbuchhaltung rechnet so weiter.
  const zeit = (minutes: number): string => (minutes > 0 ? minutesToDecimalHours(minutes) : '')

  const rowsHtml = params.rows
    .map(
      (row) => `<tr${row.key ? ' class="has-key"' : ''}>
  <td class="center">${row.day}</td>
  <td class="center">${esc(row.begin)}</td>
  <td class="center">${esc(zeit(row.pauseMinutes))}</td>
  <td class="center">${esc(row.end)}</td>
  <td class="center">${esc(zeit(row.workMinutes))}</td>
  <td class="center key-cell">${esc(row.key)}</td>
  <td class="center">${esc(row.begin || row.key ? row.dateKey.split('-').reverse().join('.') : '')}</td>
  <td>${esc(row.remark)}</td>
</tr>`
    )
    .join('')

  const legende = DATEV_KEY_LEGEND.map(
    (item) => `<div><span class="legend-key">${esc(item.key)}</span>${esc(item.label)}</div>`
  ).join('')

  return `  <h1>Vorlage zur Dokumentation der täglichen Arbeitszeit</h1>
  <div class="kopf">
    <div>Firma:</div><div class="feld">${esc(company)}</div>
    <div>Monat/Jahr:</div><div class="feld">${esc(params.periodLabel)}</div>
    <div>Name des Mitarbeiters:</div><div class="feld">${esc(params.employeeName || '')}</div>
    <div>Pers.-Nr.:</div><div class="feld">${esc(params.personnelNumber || '')}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Kalender-<br>tag</th>
        <th>Beginn<br>(Uhrzeit)</th>
        <th>Pause<br>(Dauer)</th>
        <th>Ende<br>(Uhrzeit)</th>
        <th>Dauer<br>(Summe)</th>
        <th>*</th>
        <th>aufgezeichnet<br>am:</th>
        <th>Bemerkungen</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="center">Summe:</td>
        <td class="center">${esc(minutesToDecimalHours(datevTotalMinutes(params.rows)))}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>

  <div class="abschluss">
    <div class="unterschriften">
      <div class="box">
        <div class="linie"></div>
        <p>Datum, Unterschrift des Arbeitnehmers</p>
      </div>
      <div class="box">
        <div class="linie"></div>
        <p>Datum, Unterschrift des Arbeitgebers</p>
      </div>
    </div>

    <div class="legende">
      <div class="titel">
        Tragen Sie in die mit * überschriebene Spalte eines der folgenden Kürzel ein,
        wenn es für diesen Kalendertag zutrifft:
      </div>
      <div class="eintraege">${legende}</div>
    </div>
  </div>
${
    params.summary
      ? `
  <div class="abrechnung-seite">
    <div class="abrechnung-kopf">${esc(params.employeeName || '-')} · ${esc(params.periodLabel)}</div>
    ${buildSettlementSummaryHtml(params.summary)}
  </div>`
      : ''
  }`
}

/** Stylesheet des DATEV-Nachweises – einmal je Dokument, auch im Sammeldruck. */
const DATEV_PRINT_CSS = `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #222;
      background: #fff;
      font-size: 11px;
    }
    h1 {
      font-size: 14px;
      margin: 0 0 10px;
      font-weight: 600;
    }
    .kopf {
      display: grid;
      grid-template-columns: 120px 1fr 90px 1fr;
      gap: 4px 8px;
      align-items: center;
      margin-bottom: 12px;
    }
    .kopf .feld {
      border: 1px solid #999;
      min-height: 18px;
      padding: 2px 6px;
      background: #fff;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border: 1px solid #999;
      padding: 2px 4px;
      height: 18px;
      vertical-align: middle;
    }
    th {
      background: #f2f2f2;
      font-weight: 600;
      font-size: 10px;
      line-height: 1.15;
    }
    .center { text-align: center; }
    .key-cell { font-weight: 700; }
    /* Zeile mit Kürzel leicht hinterlegen – im Ausdruck sofort erkennbar. */
    tr.has-key td { background: #f7f7f7; }
    /* Keine Zeile darf der Seitenumbruch zerschneiden. */
    tr { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tfoot td { font-weight: 700; }
    .abschluss { page-break-inside: avoid; break-inside: avoid; }
    .unterschriften {
      display: flex;
      gap: 48px;
      margin-top: 34px;
    }
    .unterschriften .box { flex: 1 1 0; }
    .unterschriften .linie { border-top: 1px solid #222; margin-bottom: 4px; }
    .unterschriften p { margin: 0; font-size: 10px; }
    .legende {
      margin-top: 16px;
      font-size: 10px;
      color: #333;
    }
    .legende .titel { margin-bottom: 4px; }
    .legende .eintraege {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 2px 16px;
    }
    .legend-key {
      display: inline-block;
      width: 26px;
      font-weight: 700;
    }
    /* Abrechnung auf einem eigenen Blatt hinter dem unterschriebenen Nachweis. */
    .abrechnung-seite {
      page-break-before: always;
      break-before: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* Das Abrechnungsblatt trägt keinen Tabellenkopf – ohne diese Zeile wäre
       nicht erkennbar, zu wem es gehört. */
    .abrechnung-kopf {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #222;
    }
    .summary-title {
      font-size: 13px;
      margin: 0 0 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .summary-table th { text-align: left; }
    .summary-table .right { text-align: right; }
    .summary-table tr.summary-total td {
      font-weight: 700;
      border-top: 2px solid #222;
    }
    .summary-table tr.summary-note td { color: #555; }
    @page { margin: 10mm; size: A4 portrait; }
`

/**
 * Sammeldruck: jeder Mitarbeiter beginnt auf einem neuen Blatt. Der Nachweis
 * wird je Mitarbeiter unterschrieben, er darf nie mit einem anderen auf einer
 * Seite stehen.
 */
const DATEV_BATCH_CSS = `
    .datev-sheet + .datev-sheet {
      page-break-before: always;
      break-before: page;
    }
`

const wrapDatevDocument = (title: string, css: string, body: string): string => `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${css}  </style>
</head>
<body>
${body}
</body>
</html>`

export const buildDatevPrintHtml = (params: DatevPrintParams): string =>
  wrapDatevDocument(
    `Arbeitszeitdokumentation ${params.employeeName} – ${params.periodLabel}`,
    DATEV_PRINT_CSS,
    buildDatevBodyHtml(params)
  )

/** Alle Mitarbeiter des Zeitraums in einem Druckauftrag, je einer pro Blatt. */
export const buildDatevBatchPrintHtml = (
  reports: DatevPrintParams[],
  documentTitle = 'Arbeitszeitdokumentation'
): string =>
  wrapDatevDocument(
    documentTitle,
    DATEV_PRINT_CSS + DATEV_BATCH_CSS,
    reports
      .map((report) => `  <section class="datev-sheet">\n${buildDatevBodyHtml(report)}\n  </section>`)
      .join('\n')
  )
