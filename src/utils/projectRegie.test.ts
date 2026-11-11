import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildProjectRegie, customerEntryNote, invoiceRegieQuantities, quantityFingerprint, regieDifferences } from './projectRegie'
import { projectRegiePdf } from './projectRegiePdf'

const entry = {
  employeeId: 'e1', clockInTime: new Date(2026, 9, 5, 8, 7), clockOutTime: new Date(2026, 9, 5, 10, 8),
  pauseTotalTime: 15 * 60000, returnTravelCreditMs: 10 * 60000,
  manualTimeEntry: true, manualTimeEntryAddedByDisplayName: 'Admin', notes: 'Fliesen verlegt | Nachtrag durch Admin',
  materialUsages: [{ materialTypeId: 'tile', materialName: 'Fliese', quantity: 10, unitLabel: 'm²' }]
}
const build = (project = {}) => buildProjectRegie('p', { name: 'Bad', customerName: 'Müller', ...project },
  [entry, { ...entry, clockOutTime: undefined }], [{ id: 'e1', name: 'Max' }],
  [{ kind: 'consumption', materialTypeId: 'tile', materialName: 'Fliese', quantity: 3, unitLabel: 'm²' },
    { materialTypeId: 'tile', materialName: 'Fliese', quantity: 1, unitLabel: 'm²' }], [])
const lines = [{ articleId: 'tile', description: 'Anderer Rechnungstext', quantity: 15, unit: 'm²', lineKind: 'article' }]

describe('Gesamt-Regiebericht', () => {
  it('aggregiert abgeschlossene Buchungen, Verbrauch und Rückgaben ohne Preise oder Nachtragnotiz', () => {
    const report = build()
    expect(report.days).toHaveLength(1)
    expect(report.days[0].hours).toBe(2.17)
    expect(report.days[0].notes).toEqual(['Fliesen verlegt'])
    expect(report.quantities.find((q) => q.key === 'tile:m²')?.quantity).toBe(12)
    expect(report.materialBookings).toHaveLength(3)
    expect(JSON.stringify(report)).not.toContain('Nachtrag durch')
  })
  it('entfernt nur den bekannten automatisch erzeugten Zusatz', () => {
    expect(customerEntryNote({ ...entry, notes: 'Nachtrag durch Admin' })).toBe('')
    expect(customerEntryNote({ notes: 'Nachtrag durch Kunden gewünscht' })).toBe('Nachtrag durch Kunden gewünscht')
    expect(customerEntryNote({ ...entry, notes: 'Eigene Notiz' })).toBe('Eigene Notiz')
  })
  it('vergleicht Artikel-ID und Einheit, addiert doppelte Zeilen und ignoriert Text/optionale Positionen', () => {
    const report = build()
    const invoice = invoiceRegieQuantities([...lines, { ...lines[0], quantity: 2 }, { ...lines[0], quantity: 99, optional: true }, { ...lines[0], lineKind: 'heading' }], report.sourceQuantities)
    expect(invoice).toEqual([{ key: 'tile:m²', name: 'Fliese', quantity: 17, unit: 'm²' }])
    expect(regieDifferences(report, lines)).toEqual(expect.arrayContaining([{ name: 'Fliese', unit: 'm²', report: 12, invoice: 15 }]))
    const differentUnit = invoiceRegieQuantities([{ ...lines[0], unit: 'Stück' }], report.sourceQuantities)
    expect(differentUnit[0].key).not.toBe('tile:m²')
  })
  it('übernimmt bestätigte Gesamtmengen und verwirft sie bei geänderten Buchungsmengen', () => {
    const report = build()
    const correction = { sourceFingerprint: quantityFingerprint(report.sourceQuantities), quantities: invoiceRegieQuantities(lines, report.sourceQuantities) }
    const corrected = build({ regieQuantityCorrection: correction })
    expect(corrected.corrected).toBe(true)
    expect(regieDifferences(corrected, lines)).toEqual([])
    expect(corrected.days).toEqual(report.days)
    expect(build({ regieQuantityCorrection: { ...correction, sourceFingerprint: 'alter Stand' } }).corrected).toBe(false)
  })
  it('fasst Stundenpositionen mit verschiedenen Einheiten zusammen', () => {
    const invoice = invoiceRegieQuantities(['Std.', 'h', 'Stunden'].map((unit) => ({ articleId: unit, description: 'Lohn', quantity: 2, unit })), [])
    expect(invoice).toEqual([{ key: 'labor:h', name: 'Arbeitszeit', quantity: 6, unit: 'Stunden' }])
  })
  it('erzeugt ein gültiges mehrseitiges PDF auch bei langen Notizen und Sonderzeichen', async () => {
    const report = build()
    report.days[0].notes = Array.from({ length: 100 }, (_, i) => `${i} Leistung Müller 😀 ${'Langtext '.repeat(15)}`)
    const bytes = await projectRegiePdf(report)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(2)
    expect(pdf.getPages().every((p) => p.getWidth() > 590 && p.getHeight() > 840)).toBe(true)
  })
})
