import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { formatCurrency, minutesToHoursLabel, type ReportSettlementSummary } from './reportUtils'
import {
  COMPANY_NAME,
  buildEmployeePrintRows,
  buildSettlementSummaryLines,
  calculateEmployeePrintTotalHours,
  type EmployeePrintParams
} from './printHtml'
import { DATEV_KEY_LEGEND, datevTotalMinutes } from './datevReport'
import type { DatevPrintParams } from './datevPrintHtml'

// Erzeugt die Berichte als PDF – das ist das Format, das an die Lohnbuchhaltung
// geht. Bewusst direkt gezeichnet statt HTML zu konvertieren: das braucht weder
// einen Browser auf dem Server noch eine Konvertierungs-Bibliothek, läuft im
// Client in Millisekunden und das Ergebnis ist Seite für Seite vorhersagbar.

const PAGE = { width: 595.28, height: 841.89 } // A4 hochkant in Punkt
const MARGIN = 34
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN

const COLOR_TEXT = rgb(0.13, 0.13, 0.13)
const COLOR_MUTED = rgb(0.36, 0.36, 0.36)
const COLOR_BORDER = rgb(0.72, 0.72, 0.72)
const COLOR_LINE = rgb(0.13, 0.13, 0.13)
const COLOR_HEAD_BG = rgb(0.95, 0.95, 0.95)
const COLOR_WEEKEND_BG = rgb(0.972, 0.972, 0.972)
const COLOR_HOLIDAY_BG = rgb(1, 0.972, 0.874)
const COLOR_VACATION_BG = rgb(0.918, 0.961, 0.918)

/**
 * Zeichen, die die Standard-Schrift (WinAnsi) nicht kennt, würden pdf-lib
 * abbrechen lassen. Ein Bericht darf nicht am Versand scheitern, weil jemand
 * ein Emoji in die Dokumentation getippt hat – solche Zeichen fallen raus.
 */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const sanitize = (value: string): string =>
  [...(value || '')]
    .map((zeichen) => {
      const code = zeichen.charCodeAt(0)
      if (code >= 32 && code <= 126) return zeichen
      if (code >= 160 && code <= 255) return zeichen
      if (WIN_ANSI_EXTRA.includes(zeichen)) return zeichen
      return ' '
    })
    .join('')

interface Sheet {
  doc: PDFDocument
  regular: PDFFont
  bold: PDFFont
  page: PDFPage
  /** Aktuelle Schreibposition von oben gemessen (Baseline-Oberkante). */
  y: number
  /** Wird nach jedem Seitenumbruch gezeichnet, z. B. der Tabellenkopf. */
  onNewPage: ((sheet: Sheet) => void) | null
}

const addPage = (sheet: Sheet): void => {
  sheet.page = sheet.doc.addPage([PAGE.width, PAGE.height])
  sheet.y = PAGE.height - MARGIN
  if (sheet.onNewPage) sheet.onNewPage(sheet)
}

/** Reicht der Platz auf der Seite noch? Sonst umbrechen. */
const ensureSpace = (sheet: Sheet, needed: number): void => {
  if (sheet.y - needed < MARGIN) addPage(sheet)
}

const textWidth = (font: PDFFont, text: string, size: number): number =>
  font.widthOfTextAtSize(sanitize(text), size)

/** Bricht Text auf die Spaltenbreite um; \n bleibt ein harter Umbruch. */
const wrapText = (font: PDFFont, text: string, size: number, maxWidth: number): string[] => {
  const zeilen: string[] = []
  for (const absatz of sanitize(text).split('\n')) {
    const woerter = absatz.split(/\s+/).filter(Boolean)
    if (woerter.length === 0) {
      zeilen.push('')
      continue
    }
    let aktuell = ''
    for (const wort of woerter) {
      const kandidat = aktuell ? `${aktuell} ${wort}` : wort
      if (font.widthOfTextAtSize(kandidat, size) <= maxWidth || !aktuell) {
        aktuell = kandidat
      } else {
        zeilen.push(aktuell)
        aktuell = wort
      }
    }
    if (aktuell) zeilen.push(aktuell)
  }
  return zeilen
}

interface Column {
  width: number
  align?: 'left' | 'right' | 'center'
}

interface CellOptions {
  bold?: boolean
  size?: number
  color?: RGB
  background?: RGB
  /** Zweite, kleinere Zeile in derselben Zelle (z. B. „Wochenende") */
  subnote?: string
}

/**
 * Zeichnet eine Tabellenzeile mit Rahmen. Die Höhe richtet sich nach der
 * Zelle mit den meisten Zeilen, damit nichts überlappt.
 */
const drawRow = (
  sheet: Sheet,
  columns: Column[],
  cells: string[],
  options: { size?: number; bold?: boolean; background?: RGB; cellOptions?: (CellOptions | null)[] } = {}
): void => {
  const size = options.size ?? 8
  const lineHeight = size + 2.5
  const padding = 4

  const zellen = cells.map((inhalt, index) => {
    const spezial = options.cellOptions?.[index] || null
    const font = spezial?.bold ?? options.bold ? sheet.bold : sheet.regular
    const zellSize = spezial?.size ?? size
    const zeilen = wrapText(font, inhalt, zellSize, columns[index].width - 2 * padding)
    const subnote = spezial?.subnote ? sanitize(spezial.subnote) : ''
    return { spezial, font, size: zellSize, zeilen, subnote }
  })

  const maxZeilen = Math.max(1, ...zellen.map((z) => z.zeilen.length + (z.subnote ? 1 : 0)))
  const height = maxZeilen * lineHeight + 2 * padding - 2

  ensureSpace(sheet, height)
  const top = sheet.y
  let x = MARGIN

  zellen.forEach((zelle, index) => {
    const spalte = columns[index]
    const hintergrund = zelle.spezial?.background || options.background
    sheet.page.drawRectangle({
      x,
      y: top - height,
      width: spalte.width,
      height,
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
      ...(hintergrund ? { color: hintergrund } : {})
    })

    let zeilenY = top - padding - zelle.size
    const alleZeilen = zelle.subnote ? [...zelle.zeilen, zelle.subnote] : zelle.zeilen
    alleZeilen.forEach((zeile, zeilenIndex) => {
      const istSubnote = !!zelle.subnote && zeilenIndex === alleZeilen.length - 1
      const font = istSubnote ? sheet.regular : zelle.font
      const zeilenSize = istSubnote ? zelle.size - 1 : zelle.size
      const breite = font.widthOfTextAtSize(zeile, zeilenSize)
      let textX = x + padding
      if (spalte.align === 'right') textX = x + spalte.width - padding - breite
      else if (spalte.align === 'center') textX = x + (spalte.width - breite) / 2
      sheet.page.drawText(zeile, {
        x: textX,
        y: zeilenY,
        size: zeilenSize,
        font,
        color: istSubnote ? COLOR_MUTED : zelle.spezial?.color || COLOR_TEXT
      })
      zeilenY -= lineHeight
    })

    x += spalte.width
  })

  sheet.y = top - height
}

/** Absatz über die volle Breite. */
const drawParagraph = (
  sheet: Sheet,
  text: string,
  options: { size?: number; bold?: boolean; color?: RGB; gap?: number } = {}
): void => {
  const size = options.size ?? 9
  const font = options.bold ? sheet.bold : sheet.regular
  const zeilen = wrapText(font, text, size, CONTENT_WIDTH)
  const lineHeight = size + 3
  ensureSpace(sheet, zeilen.length * lineHeight)
  for (const zeile of zeilen) {
    sheet.y -= size
    sheet.page.drawText(zeile, {
      x: MARGIN,
      y: sheet.y,
      size,
      font,
      color: options.color || COLOR_TEXT
    })
    sheet.y -= lineHeight - size
  }
  sheet.y -= options.gap ?? 0
}

const columnsFromFractions = (fractions: number[], aligns: Column['align'][] = []): Column[] =>
  fractions.map((anteil, index) => ({
    width: CONTENT_WIDTH * anteil,
    align: aligns[index] || 'left'
  }))

const SUMMARY_ROW_SIZE = 8
const SUMMARY_ROW_LINE_HEIGHT = SUMMARY_ROW_SIZE + 2.5

/**
 * Höhe des Abrechnungsblocks, bevor er gezeichnet wird. Nur so lässt sich der
 * Block als Ganzes auf die nächste Seite schieben – auseinandergerissen ist er
 * für die Lohnbuchhaltung wertlos.
 */
const measureSettlementSummary = (sheet: Sheet, summary: ReportSettlementSummary): number => {
  const columns = columnsFromFractions([0.42, 0.38, 0.2])
  const zeilenHoehe = (zellen: string[], fett: boolean): number => {
    const font = fett ? sheet.bold : sheet.regular
    const zeilen = Math.max(
      1,
      ...zellen.map(
        (inhalt, index) =>
          wrapText(font, inhalt, SUMMARY_ROW_SIZE, columns[index].width - 8).length
      )
    )
    return zeilen * SUMMARY_ROW_LINE_HEIGHT + 6
  }

  let hoehe = 33 // Abstand über der Überschrift + Überschrift selbst
  hoehe += zeilenHoehe(['Position', 'Berechnung', 'Summe'], true)
  for (const line of buildSettlementSummaryLines(summary)) {
    hoehe += zeilenHoehe([line.label, line.detail, line.amount], !!line.isTotal)
  }
  return hoehe
}

/**
 * Abrechnungsblock – identische Posten wie im HTML-Ausdruck.
 *
 * @param reserveExtra zusätzlicher Platz, der auf derselben Seite frei bleiben
 *   muss (z. B. für die Unterschriften darunter).
 */
const drawSettlementSummary = (
  sheet: Sheet,
  summary: ReportSettlementSummary,
  reserveExtra = 0
): void => {
  const columns = columnsFromFractions([0.42, 0.38, 0.2], ['left', 'left', 'right'])
  // Der Block wandert komplett auf die nächste Seite, wenn er hier nicht mehr
  // ganz hinpasst.
  ensureSpace(sheet, measureSettlementSummary(sheet, summary) + reserveExtra)
  sheet.y -= 16
  sheet.y -= 11
  sheet.page.drawText('Abrechnung', { x: MARGIN, y: sheet.y, size: 11, font: sheet.bold, color: COLOR_TEXT })
  sheet.y -= 6

  drawRow(sheet, columns, ['Position', 'Berechnung', 'Summe'], {
    bold: true,
    size: SUMMARY_ROW_SIZE,
    background: COLOR_HEAD_BG
  })

  for (const line of buildSettlementSummaryLines(summary)) {
    const farbe = line.isNote ? COLOR_MUTED : COLOR_TEXT
    if (line.isTotal) {
      // Trennlinie über der Summenzeile, wie im Ausdruck.
      sheet.page.drawLine({
        start: { x: MARGIN, y: sheet.y },
        end: { x: MARGIN + CONTENT_WIDTH, y: sheet.y },
        thickness: 1.2,
        color: COLOR_LINE
      })
    }
    drawRow(sheet, columns, [line.label, line.detail, line.amount], {
      bold: line.isTotal,
      size: SUMMARY_ROW_SIZE,
      cellOptions: [
        { color: farbe },
        { color: farbe },
        { color: farbe }
      ]
    })
  }
}

/** Unterschriftenfelder – jeder Bericht wird von beiden Seiten gezeichnet. */
const drawSignatures = (sheet: Sheet, employeeName: string, companyName: string): void => {
  ensureSpace(sheet, 56)
  sheet.y -= 34
  const spaltenBreite = (CONTENT_WIDTH - 48) / 2
  const felder = [
    { x: MARGIN, label: employeeName || 'Mitarbeiter' },
    { x: MARGIN + spaltenBreite + 48, label: companyName }
  ]
  for (const feld of felder) {
    sheet.page.drawLine({
      start: { x: feld.x, y: sheet.y },
      end: { x: feld.x + spaltenBreite, y: sheet.y },
      thickness: 0.8,
      color: COLOR_LINE
    })
    sheet.page.drawText(sanitize(feld.label), {
      x: feld.x,
      y: sheet.y - 10,
      size: 8,
      font: sheet.regular,
      color: COLOR_MUTED
    })
  }
  sheet.y -= 14
}

const createSheet = async (): Promise<Sheet> => {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const sheet: Sheet = {
    doc,
    regular,
    bold,
    page: doc.addPage([PAGE.width, PAGE.height]),
    y: PAGE.height - MARGIN,
    onNewPage: null
  }
  return sheet
}

/** Arbeitszeitnachweis eines Mitarbeiters als PDF. */
export const buildEmployeeReportPdf = async (
  params: EmployeePrintParams
): Promise<Uint8Array> => {
  const sheet = await createSheet()
  const company = params.companyName || COMPANY_NAME
  const rows = buildEmployeePrintRows(params.reportEntries, params.startDate, params.endDate)
  const columns = columnsFromFractions(
    [0.16, 0.31, 0.11, 0.11, 0.1, 0.21],
    ['left', 'left', 'center', 'center', 'center', 'right']
  )

  // Kopf der Folgeseiten: ohne ihn wäre auf Seite 3 nicht erkennbar, zu wem
  // sie gehört – im Sammelversand liegen viele Berichte nebeneinander.
  const drawTableHead = (ziel: Sheet): void => {
    drawRow(
      ziel,
      [{ width: CONTENT_WIDTH }],
      [`${params.employeeName || '-'} · ${params.periodLabel}`],
      { bold: true, size: 9, background: COLOR_HEAD_BG }
    )
    drawRow(ziel, columns, ['Tag', 'Projekt', 'Kommen', 'Gehen', 'Pause', 'Arbeitszeit'], {
      bold: true,
      background: COLOR_HEAD_BG
    })
  }

  sheet.y -= 14
  sheet.page.drawText(sanitize(company), {
    x: MARGIN,
    y: sheet.y,
    size: 14,
    font: sheet.bold,
    color: COLOR_TEXT
  })
  const nameBreite = textWidth(sheet.bold, params.employeeName || '-', 11)
  sheet.page.drawText(sanitize(params.employeeName || '-'), {
    x: MARGIN + CONTENT_WIDTH - nameBreite,
    y: sheet.y,
    size: 11,
    font: sheet.bold,
    color: COLOR_TEXT
  })
  sheet.y -= 8
  sheet.page.drawLine({
    start: { x: MARGIN, y: sheet.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: sheet.y },
    thickness: 1.5,
    color: COLOR_LINE
  })
  sheet.y -= 6

  drawParagraph(sheet, `Zeitraum: ${params.periodLabel}`, { size: 9 })
  if (params.regularWorkTimeLabel) {
    drawParagraph(sheet, `Regelarbeitszeit: ${params.regularWorkTimeLabel}`, { size: 9 })
  }
  if (params.payoutMinutes) {
    drawParagraph(
      sheet,
      `Ausbezahlte Überstunden: ${minutesToHoursLabel(params.payoutMinutes)} Std (in den Zeiten enthalten)`,
      { size: 9 }
    )
  }
  sheet.y -= 8

  sheet.onNewPage = drawTableHead
  drawTableHead(sheet)

  for (const row of rows) {
    const hintergrund = row.holidayName
      ? COLOR_HOLIDAY_BG
      : row.isVacation
        ? COLOR_VACATION_BG
        : row.isWeekend
          ? COLOR_WEEKEND_BG
          : undefined
    const subnote = [row.isWeekend ? 'Wochenende' : '', row.holidayName ? `Feiertag: ${row.holidayName}` : '']
      .filter(Boolean)
      .join(' · ')

    drawRow(
      sheet,
      columns,
      [
        row.dateLabel,
        row.projectName,
        row.clockIn,
        row.clockOut,
        row.pauseMinutes === null ? '—' : String(row.pauseMinutes),
        row.workHours
      ],
      {
        background: hintergrund,
        cellOptions: [subnote ? { subnote } : null, null, null, null, null, null]
      }
    )

    const doku = (row.notes || '').trim()
    if (doku) {
      // Wie im Ausdruck: die Dokumentation steht über die volle Breite unter
      // der Zeitzeile, nicht in einer schmalen Spalte.
      drawRow(sheet, [{ width: CONTENT_WIDTH }], [`Dokumentation: ${doku}`], {
        size: 7,
        cellOptions: [{ color: COLOR_MUTED }]
      })
    }
  }

  drawRow(
    sheet,
    [{ width: columns.slice(0, 5).reduce((s, c) => s + c.width, 0) }, { ...columns[5] }],
    ['Gesamt:', calculateEmployeePrintTotalHours(rows)],
    { bold: true, background: COLOR_HEAD_BG }
  )

  // Ab hier kein wiederholter Tabellenkopf mehr. Abrechnung, Fußnote und
  // Unterschriften bleiben zusammen – sonst wird auf einem leeren Blatt
  // unterschrieben.
  sheet.onNewPage = null
  const platzDarunter = 56 + (params.regularWorkTimeLabel ? 32 : 0)
  if (params.summary) drawSettlementSummary(sheet, params.summary, platzDarunter)
  if (params.regularWorkTimeLabel) {
    sheet.y -= 10
    drawParagraph(
      sheet,
      'Über die Regelarbeitszeit hinaus geleistete Zeit ist nicht ausgewiesen, sondern dem Überstundenkonto gutgeschrieben.',
      { size: 7.5, color: COLOR_MUTED }
    )
  }
  drawSignatures(sheet, params.employeeName, company)

  return sheet.doc.save()
}

/** DATEV-Nachweis eines Mitarbeiters als PDF. */
export const buildDatevReportPdf = async (params: DatevPrintParams): Promise<Uint8Array> => {
  const sheet = await createSheet()
  const company = params.companyName || COMPANY_NAME
  const columns = columnsFromFractions(
    [0.1, 0.1, 0.09, 0.1, 0.1, 0.05, 0.13, 0.33],
    ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'left']
  )

  const drawTableHead = (ziel: Sheet): void => {
    drawRow(
      ziel,
      columns,
      [
        'Kalendertag',
        'Beginn\n(Uhrzeit)',
        'Pause\n(Dauer)',
        'Ende\n(Uhrzeit)',
        'Dauer\n(Summe)',
        '*',
        'aufgezeichnet\nam:',
        'Bemerkungen'
      ],
      { bold: true, size: 7, background: COLOR_HEAD_BG }
    )
  }

  sheet.y -= 12
  sheet.page.drawText(sanitize('Vorlage zur Dokumentation der täglichen Arbeitszeit'), {
    x: MARGIN,
    y: sheet.y,
    size: 12,
    font: sheet.bold,
    color: COLOR_TEXT
  })
  sheet.y -= 12

  // Kopfdaten wie auf der Vorlage: Beschriftung links, Wert im Kasten daneben.
  const kopfSpalten = columnsFromFractions([0.22, 0.28, 0.18, 0.32])
  const kopfZeilen: [string, string, string, string][] = [
    ['Firma:', company, 'Monat/Jahr:', params.periodLabel],
    ['Name des Mitarbeiters:', params.employeeName || '', 'Pers.-Nr.:', params.personnelNumber || '']
  ]
  for (const zeile of kopfZeilen) {
    drawRow(sheet, kopfSpalten, zeile, {
      size: 8,
      cellOptions: [{ bold: true }, null, { bold: true }, null]
    })
  }
  sheet.y -= 10

  sheet.onNewPage = drawTableHead
  drawTableHead(sheet)

  for (const row of params.rows) {
    const zeit = (minutes: number): string => (minutes > 0 ? minutesToHoursLabel(minutes) : '')
    drawRow(
      sheet,
      columns,
      [
        String(row.day),
        row.begin,
        zeit(row.pauseMinutes),
        row.end,
        zeit(row.workMinutes),
        row.key,
        row.begin || row.key ? row.dateKey.split('-').reverse().join('.') : '',
        row.remark
      ],
      {
        size: 7.5,
        background: row.key ? COLOR_WEEKEND_BG : undefined,
        cellOptions: [null, null, null, null, null, { bold: true }, null, null]
      }
    )
  }

  drawRow(
    sheet,
    [
      { width: columns.slice(0, 4).reduce((s, c) => s + c.width, 0), align: 'center' },
      { ...columns[4] },
      { width: columns.slice(5).reduce((s, c) => s + c.width, 0) }
    ],
    ['Summe:', minutesToHoursLabel(datevTotalMinutes(params.rows)), ''],
    { bold: true, size: 8, background: COLOR_HEAD_BG }
  )

  sheet.onNewPage = null
  ensureSpace(sheet, 110)
  sheet.y -= 20
  const spaltenBreite = (CONTENT_WIDTH - 48) / 2
  for (const feld of [
    { x: MARGIN, label: 'Datum, Unterschrift des Arbeitnehmers' },
    { x: MARGIN + spaltenBreite + 48, label: 'Datum, Unterschrift des Arbeitgebers' }
  ]) {
    sheet.page.drawLine({
      start: { x: feld.x, y: sheet.y },
      end: { x: feld.x + spaltenBreite, y: sheet.y },
      thickness: 0.8,
      color: COLOR_LINE
    })
    sheet.page.drawText(sanitize(feld.label), {
      x: feld.x,
      y: sheet.y - 10,
      size: 7.5,
      font: sheet.regular,
      color: COLOR_MUTED
    })
  }
  sheet.y -= 26

  drawParagraph(
    sheet,
    'Tragen Sie in die mit * überschriebene Spalte eines der folgenden Kürzel ein, wenn es für diesen Kalendertag zutrifft:',
    { size: 7.5, color: COLOR_MUTED, gap: 4 }
  )
  drawParagraph(
    sheet,
    DATEV_KEY_LEGEND.map((item) => `${item.key} = ${item.label}`).join('   ·   '),
    { size: 7.5, color: COLOR_MUTED }
  )

  // Die Abrechnung geht auf ein eigenes Blatt hinter den unterschriebenen
  // Nachweis – so wie beim Ausdruck.
  if (params.summary) {
    addPage(sheet)
    sheet.y -= 10
    sheet.page.drawText(sanitize(`${params.employeeName || '-'} · ${params.periodLabel}`), {
      x: MARGIN,
      y: sheet.y,
      size: 10,
      font: sheet.bold,
      color: COLOR_TEXT
    })
    sheet.y -= 6
    sheet.page.drawLine({
      start: { x: MARGIN, y: sheet.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: sheet.y },
      thickness: 1,
      color: COLOR_LINE
    })
    drawSettlementSummary(sheet, params.summary)
  }

  return sheet.doc.save()
}

/** PDF-Bytes als base64 – so geht der Anhang an die Function. */
export const pdfToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export { formatCurrency }
