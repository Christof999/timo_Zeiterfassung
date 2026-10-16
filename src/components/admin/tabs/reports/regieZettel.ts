import type { Employee, MaterialCredit, TimeEntry } from '../../../../types'
import { bookedEntryHours } from '../../../../utils/offerHours'
import { siteTripFlatRateTotal, type SiteTrip } from '../../../../utils/siteTrips'
import { COMPANY_NAME } from './printHtml'
import {
  convertToDate,
  employeeBillingRate,
  escapeHtml,
  formatCurrency,
  formatDateForDisplay,
  formatTimeForInput,
  getDateKey,
  parseDateInputAsLocalDate
} from './reportUtils'
import { roundTimeToStep } from '../../../../utils/timeRounding'

/**
 * Regiezettel: kundenfähiges Tagesblatt aus den Stempelungen.
 *
 * Stundenbasis wie die Nachkalkulation (15-Minuten-Raster, Pause abgezogen,
 * Rückfahrt angerechnet). Aufgefüllte Überstunden, Lohnkosten, Einkauf und
 * Marge kommen hier nicht vor – nur der Verkaufspreis.
 */

export interface RegieLaborLine {
  employeeName: string
  clockIn: string
  clockOut: string
  /** Auf zwei Nachkommastellen gerundet, damit Betrag und ausgewiesene Stunden zusammenpassen. */
  hours: number
  /** Verkaufspreis je Stunde. null, wenn keiner hinterlegt ist. */
  hourlyRate: number | null
  lineTotal: number
}

export interface RegieMaterialLine {
  name: string
  quantity: number
  unitLabel: string
  /** Verkaufspreis je Einheit. null, wenn keiner hinterlegt oder die Buchungen verschieden sind. */
  unitPriceEur: number | null
  lineTotal: number
}

export interface RegieDaySheet {
  dateKey: string
  dateLabel: string
  /** Stempelungen, aus denen das Blatt entstanden ist. Dient dem Abgleich mit einer Unterschrift. */
  entryIds: string[]
  workNotes: string[]
  labor: RegieLaborLine[]
  materials: RegieMaterialLine[]
  tripCount: number
  /** Kfz-Pauschale je Anfahrt. 0, wenn keine hinterlegt ist. */
  tripRate: number
  tripTotal: number
  laborTotal: number
  materialTotal: number
  dayTotal: number
}

type RegieEmployee = Pick<
  Employee,
  'id' | 'name' | 'firstName' | 'lastName' | 'hourlyRate' | 'hourlyWage'
>

export interface RegieZettelInput {
  entries: TimeEntry[]
  employees: RegieEmployee[]
  /** Nachgetragener Verbrauch (kind 'consumption'). Gutschriften zählen nicht. */
  materialCredits?: MaterialCredit[]
  siteTrips?: SiteTrip[]
  siteTripRate?: number
}

const round2 = (value: number): number => Math.round(value * 100) / 100

const displayName = (employee: RegieEmployee | undefined, fallbackId: string): string =>
  employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || fallbackId

const pushNote = (notes: string[], text: string): void => {
  const trimmed = text.trim()
  if (!trimmed || notes.includes(trimmed)) return
  notes.push(trimmed)
}

interface MaterialAcc {
  name: string
  unitLabel: string
  quantity: number
  prices: number[]
  lineTotal: number
}

interface DayAcc {
  dateKey: string
  date: Date
  entryIds: string[]
  notes: string[]
  labor: RegieLaborLine[]
  materials: Map<string, MaterialAcc>
}

const addMaterial = (
  day: DayAcc,
  usage: {
    materialTypeId?: string
    materialName?: string
    unitLabel?: string
    quantity?: number
    unitPriceEur?: number
  }
): void => {
  const quantity = Number(usage.quantity) || 0
  if (!quantity) return
  const key = usage.materialTypeId || usage.materialName || 'unbekannt'
  const price =
    typeof usage.unitPriceEur === 'number' && Number.isFinite(usage.unitPriceEur)
      ? usage.unitPriceEur
      : null
  const existing = day.materials.get(key)
  const acc: MaterialAcc = existing || {
    name: usage.materialName || 'Material',
    unitLabel: usage.unitLabel || '',
    quantity: 0,
    prices: [],
    lineTotal: 0
  }
  acc.quantity += quantity
  if (price != null) {
    acc.prices.push(price)
    acc.lineTotal = round2(acc.lineTotal + round2(quantity * price))
  }
  if (!existing) day.materials.set(key, acc)
}

export const buildRegieDaySheets = (input: RegieZettelInput): RegieDaySheet[] => {
  const employeesById = new Map(
    input.employees.filter((employee) => employee.id).map((employee) => [employee.id as string, employee])
  )
  const days = new Map<string, DayAcc>()

  const ensureDay = (dateKey: string, date: Date): DayAcc => {
    const existing = days.get(dateKey)
    if (existing) return existing
    const created: DayAcc = { dateKey, date, entryIds: [], notes: [], labor: [], materials: new Map() }
    days.set(dateKey, created)
    return created
  }

  const finished = input.entries
    .filter((entry) => entry.clockOutTime && !entry.isVacationDay)
    .map((entry) => ({ entry, clockIn: convertToDate(entry.clockInTime) }))
    .filter((row): row is { entry: TimeEntry; clockIn: Date } => !!row.clockIn)
    .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime())

  for (const { entry, clockIn } of finished) {
    const day = ensureDay(getDateKey(clockIn), clockIn)
    if (entry.id) day.entryIds.push(entry.id)
    const employee = employeesById.get(entry.employeeId)
    const name = displayName(employee, entry.employeeId)
    const rate = employeeBillingRate(employee)
    const hours = round2(bookedEntryHours(entry))
    const clockOut = convertToDate(entry.clockOutTime)
    day.labor.push({
      employeeName: name,
      clockIn: formatTimeForInput(roundTimeToStep(clockIn)),
      clockOut: formatTimeForInput(roundTimeToStep(clockOut)),
      hours,
      hourlyRate: rate > 0 ? rate : null,
      lineTotal: rate > 0 ? round2(hours * rate) : 0
    })
    pushNote(day.notes, entry.notes ? `${name}: ${entry.notes}` : '')
    for (const block of entry.liveDocumentation || []) {
      const author = (block.addedByName || '').trim() || name
      pushNote(day.notes, block.notes ? `${author}: ${block.notes}` : '')
    }
    for (const usage of entry.materialUsages || []) addMaterial(day, usage)
  }

  for (const credit of input.materialCredits || []) {
    if (credit.kind !== 'consumption') continue
    const bookedAt = convertToDate(credit.createdAt)
    const dateKey = bookedAt ? getDateKey(bookedAt) : ''
    const datedDays = [...days.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    const day =
      (dateKey && days.get(dateKey)) ||
      (bookedAt ? ensureDay(dateKey, bookedAt) : datedDays[datedDays.length - 1])
    if (!day) continue
    addMaterial(day, credit)
    pushNote(day.notes, credit.note ? `Material: ${credit.note}` : '')
  }

  const tripsByDay = new Map<string, number>()
  for (const trip of input.siteTrips || []) {
    tripsByDay.set(trip.dateKey, (tripsByDay.get(trip.dateKey) || 0) + 1)
    if (!days.has(trip.dateKey)) {
      const date = parseDateInputAsLocalDate(trip.dateKey)
      if (date) ensureDay(trip.dateKey, date)
    }
  }

  const rate = Math.max(0, input.siteTripRate || 0)

  return [...days.values()]
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map((day) => {
      const materials = [...day.materials.values()]
        .map((acc) => {
          const uniquePrices = [...new Set(acc.prices)]
          return {
            name: acc.name,
            quantity: acc.quantity,
            unitLabel: acc.unitLabel,
            unitPriceEur: uniquePrices.length === 1 ? uniquePrices[0] : null,
            lineTotal: acc.lineTotal
          }
        })
        .sort((a, b) => b.lineTotal - a.lineTotal || a.name.localeCompare(b.name, 'de'))
      const tripCount = tripsByDay.get(day.dateKey) || 0
      const tripTotal = rate > 0 ? siteTripFlatRateTotal(tripCount, rate) : 0
      const laborTotal = round2(day.labor.reduce((sum, line) => sum + line.lineTotal, 0))
      const materialTotal = round2(materials.reduce((sum, line) => sum + line.lineTotal, 0))
      return {
        dateKey: day.dateKey,
        dateLabel: formatDateForDisplay(day.date),
        entryIds: day.entryIds,
        workNotes: day.notes,
        labor: day.labor,
        materials,
        tripCount,
        tripRate: rate,
        tripTotal,
        laborTotal,
        materialTotal,
        dayTotal: round2(laborTotal + materialTotal + tripTotal)
      }
    })
}

const formatHours = (hours: number): string =>
  `${hours.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`

const formatQuantity = (quantity: number, unitLabel: string): string => {
  const amount = quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return unitLabel ? `${amount} ${unitLabel}` : amount
}

const moneyCell = (amount: number | null): string => (amount == null ? '—' : formatCurrency(amount))

/** Nur echte PNG-Data-URLs. Alles andere (Skripte, fremde Schemes) kommt nicht in den Ausdruck. */
const PNG_DATA_URL = /^data:image\/png;base64,[a-z0-9+/=\s]+$/i

export const safeSignatureDataUrl = (value: string | undefined | null): string | null => {
  const trimmed = (value || '').replace(/\s/g, '')
  if (!trimmed || trimmed.length > 500_000) return null
  return PNG_DATA_URL.test(trimmed) ? trimmed : null
}

export interface RegiePrintedSignature {
  dataUrl: string
  signerName?: string
  signedAtLabel: string
  /** true, wenn nach dem Unterschreiben Stunden oder Beträge dazugekommen sind */
  outdated?: boolean
}

/** Die Unterschrift deckt nicht mehr das, was jetzt auf dem Blatt steht. */
export const isRegieSignatureOutdated = (
  sheet: Pick<RegieDaySheet, 'entryIds' | 'dayTotal'>,
  signed: { signedEntryIds: string[]; signedDayTotal: number }
): boolean => {
  const currentIds = [...sheet.entryIds].sort().join('\0')
  const signedIds = [...(signed.signedEntryIds || [])].sort().join('\0')
  return currentIds !== signedIds || Math.abs(sheet.dayTotal - (signed.signedDayTotal || 0)) > 0.009
}

export const buildRegieZettelHtml = (params: {
  sheets: RegieDaySheet[]
  projectName: string
  clientName?: string
  address?: string
  companyName?: string
  /** Kundenunterschriften, Schlüssel ist der Kalendertag (YYYY-MM-DD). */
  signatures?: Record<string, RegiePrintedSignature>
}): string => {
  const company = params.companyName || COMPANY_NAME
  const created = new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  const sheets = params.sheets
    .map((sheet) => {
      const laborRows =
        sheet.labor.length === 0
          ? '<tr><td colspan="6">Keine Stunden</td></tr>'
          : sheet.labor
              .map(
                (line) => `<tr>
  <td>${escapeHtml(line.employeeName)}</td>
  <td>${escapeHtml(line.clockIn || '—')}</td>
  <td>${escapeHtml(line.clockOut || '—')}</td>
  <td class="right">${formatHours(line.hours)}</td>
  <td class="right">${moneyCell(line.hourlyRate)}</td>
  <td class="right">${line.hourlyRate == null ? '—' : formatCurrency(line.lineTotal)}</td>
</tr>`
              )
              .join('')
      const materialBlock =
        sheet.materials.length === 0
          ? ''
          : `<h2>Material</h2>
  <table>
    <thead><tr><th>Material</th><th class="right">Menge</th><th class="right">VK</th><th class="right">Betrag</th></tr></thead>
    <tbody>${sheet.materials
      .map(
        (line) => `<tr>
      <td>${escapeHtml(line.name)}</td>
      <td class="right">${escapeHtml(formatQuantity(line.quantity, line.unitLabel))}</td>
      <td class="right">${moneyCell(line.unitPriceEur)}</td>
      <td class="right">${line.unitPriceEur == null && line.lineTotal === 0 ? '—' : formatCurrency(line.lineTotal)}</td>
    </tr>`
      )
      .join('')}</tbody>
  </table>`
      const tripBlock =
        sheet.tripCount === 0
          ? ''
          : `<h2>Anfahrt</h2>
  <table>
    <thead><tr><th>Position</th><th class="right">Anfahrten</th><th class="right">VK</th><th class="right">Betrag</th></tr></thead>
    <tbody><tr>
      <td>Baustelle angefahren</td>
      <td class="right">${sheet.tripCount}</td>
      <td class="right">${sheet.tripRate > 0 ? formatCurrency(sheet.tripRate) : '—'}</td>
      <td class="right">${sheet.tripRate > 0 ? formatCurrency(sheet.tripTotal) : '—'}</td>
    </tr></tbody>
  </table>`
      const notes =
        sheet.workNotes.length === 0
          ? '<p class="muted">Keine Leistungsbeschreibung erfasst.</p>'
          : `<ul>${sheet.workNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
      const signature = params.signatures?.[sheet.dateKey]
      const signatureUrl = safeSignatureDataUrl(signature?.dataUrl)
      const signatureImage = signatureUrl
        ? `<img class="sign-image" src="${escapeHtml(signatureUrl)}" alt="Unterschrift des Kunden" />`
        : ''
      const signatureNote = signatureUrl
        ? `<p class="sign-meta">unterschrieben${signature?.signerName ? ` von ${escapeHtml(signature.signerName)}` : ''} am ${escapeHtml(signature?.signedAtLabel || '')}</p>
    ${signature?.outdated ? '<p class="sign-warn">Nach der Unterschrift wurden Buchungen ergänzt.</p>' : ''}`
        : ''
      return `<section class="sheet">
  <header>
    <p class="company">${escapeHtml(company)}</p>
    <h1>Regiezettel</h1>
  </header>
  <dl class="meta">
    <div><dt>Projekt</dt><dd>${escapeHtml(params.projectName || '—')}</dd></div>
    <div><dt>Kunde</dt><dd>${escapeHtml(params.clientName || '—')}</dd></div>
    <div><dt>Adresse</dt><dd>${escapeHtml(params.address || '—')}</dd></div>
    <div><dt>Datum</dt><dd>${escapeHtml(sheet.dateLabel)}</dd></div>
  </dl>
  <h2>Leistung</h2>
  ${notes}
  <h2>Personal</h2>
  <table>
    <thead><tr><th>Mitarbeiter</th><th>Kommen</th><th>Gehen</th><th class="right">Stunden</th><th class="right">VK/Std</th><th class="right">Betrag</th></tr></thead>
    <tbody>${laborRows}</tbody>
  </table>
  ${materialBlock}
  ${tripBlock}
  <table class="sums">
    <tbody>
      ${sheet.labor.length > 0 ? `<tr><th>Personal</th><td class="right">${formatCurrency(sheet.laborTotal)}</td></tr>` : ''}
      ${sheet.materials.length > 0 ? `<tr><th>Material</th><td class="right">${formatCurrency(sheet.materialTotal)}</td></tr>` : ''}
      ${sheet.tripCount > 0 ? `<tr><th>Anfahrten</th><td class="right">${sheet.tripRate > 0 ? formatCurrency(sheet.tripTotal) : '—'}</td></tr>` : ''}
      <tr class="grand"><th>Summe</th><td class="right">${formatCurrency(sheet.dayTotal)}</td></tr>
    </tbody>
  </table>
  <div class="signs">
    <div><div class="sign-draw"></div><p>${escapeHtml(company)}</p></div>
    <div>
      <div class="sign-draw">${signatureImage}</div>
      <p>Kunde${params.clientName ? `: ${escapeHtml(params.clientName)}` : ''}</p>
      ${signatureNote}
    </div>
  </div>
  <p class="footnote">Erstellt aus der Zeiterfassung am ${escapeHtml(created)}.</p>
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Regiezettel</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: system-ui, sans-serif; margin: 0; color: #1a1a1a; }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    .company { margin: 0; font-size: 13px; letter-spacing: 0.02em; }
    h1 { margin: 2px 0 16px; font-size: 1.6rem; }
    h2 { margin: 22px 0 8px; font-size: 0.95rem; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 0; }
    .meta div { display: flex; gap: 8px; }
    .meta dt { min-width: 4.5rem; color: #555; }
    .meta dd { margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f4f4; font-weight: 600; }
    .right { text-align: right; }
    .muted { color: #555; font-size: 12px; }
    ul { margin: 4px 0 0; padding-left: 1.1rem; font-size: 13px; }
    .sums { width: 280px; margin-left: auto; margin-top: 16px; }
    .sums th { background: transparent; text-align: left; }
    .sums .grand th, .sums .grand td { font-size: 14px; border-top: 2px solid #222; }
    .signs { display: flex; gap: 48px; margin-top: 56px; }
    .signs > div { flex: 1; }
    .sign-draw { border-bottom: 1px solid #222; min-height: 64px; }
    .sign-image { display: block; max-width: 100%; height: 64px; object-fit: contain; object-position: left bottom; }
    .signs p { margin: 6px 0 0; font-size: 12px; }
    .sign-meta { color: #444; font-size: 11px; }
    .sign-warn { color: #8a3b00; font-size: 11px; }
    .footnote { margin-top: 28px; color: #666; font-size: 11px; }
  </style>
</head>
<body>
${sheets || '<p>Keine Buchungen.</p>'}
</body>
</html>`
}
