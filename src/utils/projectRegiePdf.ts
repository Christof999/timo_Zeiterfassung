import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ProjectRegie } from './projectRegie'

export async function projectRegiePdf(report: ProjectRegie): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595.28, 841.89])
  let y = 795
  const clean = (value: string) => [...value].map((c) => { try { font.encodeText(c); return c } catch { return ' ' } }).join('')
  const line = (value: string, heading = false) => {
    const size = heading ? 13 : 10
    const face = heading ? bold : font
    const words = clean(value).split(/\s+/)
    let text = ''
    const draw = () => {
      if (y < 50) { page = pdf.addPage([595.28, 841.89]); y = 795 }
      page.drawText(text, { x: 40, y, size, font: face, color: rgb(0.12, 0.12, 0.12) })
      y -= heading ? 24 : 16
    }
    for (const word of words) {
      const next = text ? `${text} ${word}` : word
      if (face.widthOfTextAtSize(next, size) <= 510) { text = next; continue }
      if (text) { draw(); text = '' }
      for (const character of word) {
        if (face.widthOfTextAtSize(text + character, size) > 510) { draw(); text = '' }
        text += character
      }
    }
    draw()
  }
  line('Fliesen Reislöhner', true)
  line('Regiebericht gesamt', true)
  line(`Projekt: ${report.projectName}`)
  line(`Kunde: ${report.customerName}`)
  line(`Adresse: ${report.address}`)
  line(`Zeitraum: ${report.days[0]?.date || '–'} bis ${report.days[report.days.length - 1]?.date || '–'}`)
  y -= 12
  line(report.corrected ? 'Abgestimmte Gesamtmengen' : 'Gesamtmengen', true)
  for (const q of report.quantities) line(`${q.name}: ${q.quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${q.unit}`)
  if (report.corrected) line('Die Gesamtmengen wurden mit der Rechnung abgestimmt. Die Tagesnachweise dokumentieren die ursprünglichen Buchungen; deren Unterschriften bestätigen keine späteren Mengenkorrekturen.')
  y -= 12
  line('Tagesnachweise', true)
  for (const day of report.days) {
    if (y < 105) { page = pdf.addPage([595.28, 841.89]); y = 795 }
    line(`${day.date} · ${day.employee} · ${day.hours.toLocaleString('de-DE')} h`, true)
    for (const note of day.notes) line(note)
    y -= 8
  }
  if (report.materialBookings.length) {
    if (y < 105) { page = pdf.addPage([595.28, 841.89]); y = 795 }
    y -= 12
    line('Materialnachweise', true)
    for (const booking of report.materialBookings) {
      line(`${booking.date} · ${booking.name}: ${booking.quantity.toLocaleString('de-DE')} ${booking.unit}`)
      if (booking.note) line(booking.note)
    }
  }
  if (report.signatures.length) line('Unterschriften beziehen sich auf den jeweiligen Tagesnachweis zum Zeitpunkt der Unterzeichnung. Spätere Ergänzungen und Mengenkorrekturen sind davon nicht umfasst.')
  for (const signature of report.signatures) {
    if (y < 150) { page = pdf.addPage([595.28, 841.89]); y = 795 }
    line(`Kundenunterschrift Tagesnachweis ${signature.date}: ${signature.name}`)
    const image = await pdf.embedPng(signature.dataUrl)
    const scale = Math.min(200 / image.width, 65 / image.height)
    page.drawImage(image, { x: 40, y: y - 70, width: image.width * scale, height: image.height * scale })
    y -= 90
  }
  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: 510, y: 25, size: 9, font }))
  return pdf.save()
}

export function downloadProjectRegie(bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'Regiebericht-gesamt.pdf'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
