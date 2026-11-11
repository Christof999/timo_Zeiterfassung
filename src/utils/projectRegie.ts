// Gemeinsame Quelle für beide Apps; scripts/sync-project-regie.ps1 kopiert die Dateien.
import { cleanManualEntryNotes } from './manualEntryNotes'
export interface RegieQuantity {
  key: string
  name: string
  unit: string
  quantity: number
}
export interface ProjectRegie {
  projectId: string
  projectName: string
  customerName: string
  address: string
  days: { date: string; employee: string; hours: number; notes: string[] }[]
  materialBookings: { date: string; name: string; unit: string; quantity: number; note: string }[]
  quantities: RegieQuantity[]
  sourceQuantities: RegieQuantity[]
  signatures: { date: string; name: string; dataUrl: string }[]
  corrected: boolean
}
export interface RegieInvoiceLine {
  articleId: string
  description: string
  quantity: number
  unit: string
  lineKind?: string
  optional?: boolean
}
export const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}
const str = (value: unknown): string => typeof value === 'string' ? value : ''
const num = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : []
export const regieRound = (n: number): number => Math.round(n * 100) / 100
const normalize = (s: string): string => s.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ')
const unitName = (s: string): string => /^(h|std\.?|stunden?|hour|akh|aw)$/i.test(s.trim()) ? 'h' : normalize(s)
const keyFor = (id: string, name: string, unit: string): string =>
  unitName(unit) === 'h' ? 'labor:h' : `${id || normalize(name)}:${unitName(unit)}`
export const regieDate = (value: unknown): Date | null => {
  const data = record(value)
  const date = value instanceof Date ? value
    : typeof data.seconds === 'number' ? new Date(data.seconds * 1000)
    : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}
const dateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const roundedTime = (date: Date): number => {
  const rounded = new Date(date)
  rounded.setHours(0, Math.round((date.getHours() * 60 + date.getMinutes()) / 15) * 15, 0, 0)
  return rounded.getTime()
}
export const customerEntryNote = (entry: Record<string, unknown>): string => cleanManualEntryNotes(entry).trim()
export function aggregateRegieQuantities(lines: RegieQuantity[]): RegieQuantity[] {
  const grouped = new Map<string, RegieQuantity>()
  for (const line of lines) {
    const existing = grouped.get(line.key)
    grouped.set(line.key, { ...line, quantity: regieRound((existing?.quantity || 0) + line.quantity) })
  }
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key))
}
export const quantityFingerprint = (lines: RegieQuantity[]): string =>
  JSON.stringify(lines.map(({ key, quantity }) => [key, quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))

export function buildProjectRegie(projectId: string, project: Record<string, unknown>, entries: Record<string, unknown>[], employees: Record<string, unknown>[], credits: Record<string, unknown>[], signatures: Record<string, unknown>[]): ProjectRegie {
  const quantities: RegieQuantity[] = []
  const days: ProjectRegie['days'] = []
  const materialBookings: ProjectRegie['materialBookings'] = []
  const addMaterial = (usage: Record<string, unknown>, date: string, sign = 1) => {
    const name = str(usage.materialName) || 'Material'
    const unit = str(usage.unitLabel)
    quantities.push({ key: keyFor(str(usage.materialTypeId), name, unit), name, unit, quantity: sign * num(usage.quantity) })
    materialBookings.push({ date, name, unit, quantity: sign * num(usage.quantity), note: str(usage.note) })
  }
  for (const entry of entries) {
    const start = regieDate(entry.clockInTime)
    const end = regieDate(entry.clockOutTime)
    if (!start || !end || entry.isVacationDay) continue
    const employee = employees.find((e) => e.id === entry.employeeId) || {}
    const name = str(employee.name) || `${str(employee.firstName)} ${str(employee.lastName)}`.trim() || str(entry.employeeId)
    const hours = regieRound(Math.max(0, roundedTime(end) - roundedTime(start) - num(entry.pauseTotalTime) + Math.max(0, num(entry.returnTravelCreditMs))) / 3600000)
    const notes = [customerEntryNote(entry), ...rows(entry.liveDocumentation).map((block) => str(block.notes))].filter(Boolean)
    days.push({ date: dateKey(start), employee: name, hours, notes })
    quantities.push({ key: 'labor:h', name: 'Arbeitszeit', unit: 'h', quantity: hours })
    rows(entry.materialUsages).forEach((usage) => addMaterial(usage, dateKey(start)))
  }
  for (const credit of credits) {
    const date = regieDate(credit.createdAt)
    addMaterial(credit, date ? dateKey(date) : 'Ohne Datum', credit.kind === 'consumption' ? 1 : -1)
  }
  const sourceQuantities = aggregateRegieQuantities(quantities)
  const correction = record(project.regieQuantityCorrection)
  const corrected = correction.sourceFingerprint === quantityFingerprint(sourceQuantities)
    && Array.isArray(correction.quantities)
  const correctedQuantities = rows(correction.quantities).map((q) => ({ key: str(q.key), name: str(q.name), unit: str(q.unit), quantity: num(q.quantity) }))
  return {
    projectId, projectName: str(project.name), customerName: str(project.client) || str(project.customerName),
    address: str(project.address) || str(project.location),
    days: days.sort((a, b) => a.date.localeCompare(b.date)),
    materialBookings: materialBookings.sort((a, b) => a.date.localeCompare(b.date)),
    sourceQuantities, quantities: corrected ? correctedQuantities : sourceQuantities, corrected,
    signatures: signatures.map((s) => ({ date: str(s.dateKey), name: str(s.signerName), dataUrl: str(s.signatureDataUrl) }))
      .filter((s) => /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(s.dataUrl) && s.dataUrl.length <= 500000)
  }
}

export function invoiceRegieQuantities(lines: RegieInvoiceLine[], source: RegieQuantity[]): RegieQuantity[] {
  return aggregateRegieQuantities(lines.filter((l) => !l.optional && (!l.lineKind || l.lineKind === 'article')).map((l) => {
    const key = keyFor(l.articleId, l.description, l.unit)
    const match = source.find((q) => q.key === key)
      || source.find((q) => normalize(q.name) === normalize(l.description) && unitName(q.unit) === unitName(l.unit))
    return { key: match?.key || key, name: match?.name || (unitName(l.unit) === 'h' ? 'Arbeitszeit' : l.description), unit: match?.unit || l.unit, quantity: l.quantity }
  }))
}
export function regieDifferences(report: ProjectRegie, lines: RegieInvoiceLine[]): { name: string; unit: string; report: number; invoice: number }[] {
  const invoice = invoiceRegieQuantities(lines, report.sourceQuantities)
  const all = new Map([...report.quantities, ...invoice].map((q) => [q.key, q]))
  return [...all.values()].map((q) => ({ name: q.name, unit: q.unit, report: report.quantities.find((r) => r.key === q.key)?.quantity || 0, invoice: invoice.find((r) => r.key === q.key)?.quantity || 0 }))
    .filter((q) => Math.abs(q.report - q.invoice) > 0.009)
}
