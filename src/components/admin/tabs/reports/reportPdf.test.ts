import { describe, it, expect } from 'vitest'
import { buildDatevReportPdf, buildEmployeeReportPdf, pdfToBase64 } from './reportPdf'
import { reportAttachmentFilename } from './reportUtils'
import { buildDatevRows } from './datevReport'
import type { AdjustedReportEntry } from './reportUtils'

const arbeitstag = (tag: number): AdjustedReportEntry =>
  ({
    id: `e${tag}`,
    originalEntry: {} as never,
    source: 'time-entry',
    date: `0${tag}.08.2026`,
    dateRaw: new Date(2026, 7, tag),
    dateKey: `2026-08-0${tag}`,
    projectId: 'p1',
    projectName: 'Projekt A',
    clockIn: '06:30',
    clockOut: '15:45',
    pauseMinutes: 45,
    pauseMs: 0,
    workHours: '8:30',
    notes: '',
    originalNotes: '',
    isEdited: false,
    effectivePauseMinutes: 45,
    effectiveClockOut: '15:45',
    effectiveWorkMinutes: 8 * 60 + 30,
    effectiveWorkHours: '8:30',
    workTimeAdjustments: []
  }) as AdjustedReportEntry

const eintraege = [arbeitstag(3), arbeitstag(4)]

/** Die ersten Bytes einer Datei als Text – so erkennt ein Mailprogramm den Typ. */
const magicBytes = (bytes: Uint8Array): string =>
  String.fromCharCode(...bytes.subarray(0, 5))

describe('reportAttachmentFilename', () => {
  it('hängt .pdf an – die Berichte gehen ausschließlich als PDF raus', () => {
    // Mit .html öffnet Outlook den Anhang im Browser und die Empfängerin sieht
    // den Rohtext der PDF-Datei statt des Nachweises.
    const name = reportAttachmentFilename('datev-nachweis', 'Friedrich Satzinger', {
      start: '2026-08-01',
      end: '2026-08-31'
    })
    expect(name).toBe('datev-nachweis-friedrich-satzinger-2026-08-01_2026-08-31.pdf')
  })

  it('macht aus Umlauten und Leerzeichen einen sauberen Dateinamen', () => {
    const name = reportAttachmentFilename('zeiterfassungsbericht', 'Niko Reislöhner', {
      start: '2026-08-01',
      end: '2026-08-31'
    })
    expect(name).toBe('zeiterfassungsbericht-niko-reisl-hner-2026-08-01_2026-08-31.pdf')
    expect(name).toMatch(/^[a-z0-9._-]+$/)
  })

  it('fällt ohne Namen auf "mitarbeiter" zurück', () => {
    expect(reportAttachmentFilename('bericht', '', { start: '2026-08-01', end: '2026-08-31' })).toBe(
      'bericht-mitarbeiter-2026-08-01_2026-08-31.pdf'
    )
  })
})

describe('PDF-Export der Berichte', () => {
  it('erzeugt für den DATEV-Nachweis eine echte PDF-Datei', async () => {
    const bytes = await buildDatevReportPdf({
      rows: buildDatevRows(eintraege, '2026-08-01', '2026-08-31'),
      employeeName: 'Friedrich Satzinger',
      periodLabel: 'August 2026'
    })
    expect(magicBytes(bytes)).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('erzeugt für den Zeiterfassungsbericht eine echte PDF-Datei', async () => {
    const bytes = await buildEmployeeReportPdf({
      reportEntries: eintraege,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      employeeName: 'Niko Reislöhner',
      periodLabel: 'August 2026'
    })
    expect(magicBytes(bytes)).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('überträgt die PDF-Bytes unverändert nach base64', async () => {
    const bytes = await buildDatevReportPdf({
      rows: buildDatevRows(eintraege, '2026-08-01', '2026-08-31'),
      employeeName: 'Friedrich Satzinger',
      periodLabel: 'August 2026'
    })
    const zurueck = Buffer.from(pdfToBase64(bytes), 'base64')
    expect(zurueck.length).toBe(bytes.length)
    expect(Uint8Array.from(zurueck)).toEqual(bytes)
  })
})
