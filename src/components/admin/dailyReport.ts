import type { Employee, MaterialType, Project, TimeEntry } from '../../types'
import { roundedSpanMs } from '../../utils/timeRounding'
import { getReturnTravelCreditMs } from '../../utils/returnTravel'

// Reine Berechnungslogik für den Tagesbericht (Admin-Dashboard). Bewusst ohne
// React/Firestore, damit sie testbar bleibt. Basis: die heutigen Zeiteinträge.

export interface DailyEmployeeProjectLine {
  projectName: string
  hours: number
}

export interface DailyEmployeeSummary {
  employeeId: string
  employeeName: string
  hourlyRate: number
  totalHours: number
  laborCost: number
  /** true, wenn der Mitarbeiter aktuell noch eingestempelt ist (Stunden bis jetzt gerechnet) */
  hasOpenEntry: boolean
  projects: DailyEmployeeProjectLine[]
}

export interface DailyMaterialLine {
  key: string
  name: string
  unitLabel: string
  quantity: number
  salesUnitEur?: number
  purchaseUnitEur?: number
  salesCost: number
  purchaseCost: number
  hasPurchase: boolean
}

export interface DailyReportData {
  employees: DailyEmployeeSummary[]
  totalHours: number
  totalLaborCost: number
  /** true, wenn mindestens ein Eintrag noch offen ist (Stunden bis jetzt) */
  hasOpenEntries: boolean
  materials: DailyMaterialLine[]
  materialSalesTotal: number
  materialPurchaseTotal: number
  /** Nur Positionen mit hinterlegtem Einkaufspreis fließen in Einkauf/Marge ein */
  materialMarginTotal: number
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const withToDate = value as { toDate?: () => Date; seconds?: number }
  if (typeof withToDate.toDate === 'function') {
    const d = withToDate.toDate()
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof withToDate.seconds === 'number') return new Date(withToDate.seconds * 1000)
  const d = new Date(value as string | number)
  return isNaN(d.getTime()) ? null : d
}

/** Gearbeitete Millisekunden eines Eintrags (offene Einträge bis `now`). */
function workedMs(entry: TimeEntry, now: Date): number {
  const clockIn = toDate(entry.clockInTime)
  if (!clockIn) return 0
  const clockOut = toDate(entry.clockOutTime) ?? now
  const span = roundedSpanMs(clockIn, clockOut)
  const pause = entry.pauseTotalTime || 0
  const ms = span - pause + getReturnTravelCreditMs(entry)
  return ms > 0 ? ms : 0
}

const employeeRate = (emp: Employee | undefined): number =>
  (typeof emp?.hourlyWage === 'number' && emp.hourlyWage) ||
  (typeof emp?.hourlyRate === 'number' && emp.hourlyRate) ||
  0

const round2 = (n: number): number => Math.round(n * 100) / 100

export function buildDailyReport(
  entries: TimeEntry[],
  employees: Employee[],
  projects: Project[],
  materialTypes: MaterialType[],
  now: Date = new Date()
): DailyReportData {
  const projectName = (projectId: string): string =>
    projects.find((p) => p.id === projectId)?.name || (projectId ? 'Projekt' : '—')

  const purchaseUnitPrice = (usage: {
    materialTypeId?: string
    materialName?: string
  }): number | undefined => {
    let type: MaterialType | undefined
    if (usage.materialTypeId) type = materialTypes.find((t) => t.id === usage.materialTypeId)
    if (!type && usage.materialName) {
      const n = usage.materialName.trim().toLowerCase()
      type = materialTypes.find((t) => (t.name || '').trim().toLowerCase() === n)
    }
    return typeof type?.purchasePriceEur === 'number' ? type.purchasePriceEur : undefined
  }

  // ── Mitarbeiter → Stunden je Projekt + Lohn ──
  type EmpRec = {
    name: string
    rate: number
    hoursByProject: Map<string, number>
    total: number
    open: boolean
  }
  const empMap = new Map<string, EmpRec>()

  for (const entry of entries) {
    if (entry.isVacationDay) continue
    const hours = workedMs(entry, now) / (1000 * 60 * 60)
    const emp = employees.find((e) => e.id === entry.employeeId)
    const name =
      emp?.name || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || entry.employeeId
    const rate = employeeRate(emp)
    let rec = empMap.get(entry.employeeId)
    if (!rec) {
      rec = { name, rate, hoursByProject: new Map(), total: 0, open: false }
      empMap.set(entry.employeeId, rec)
    }
    rec.total += hours
    const pName =
      entry.customerId && !entry.projectId
        ? `Kleinauftrag: ${entry.customerName || 'Kunde'}`
        : projectName(entry.projectId)
    rec.hoursByProject.set(pName, (rec.hoursByProject.get(pName) || 0) + hours)
    if (!entry.clockOutTime) rec.open = true
  }

  const employeeSummaries: DailyEmployeeSummary[] = Array.from(empMap.entries())
    .map(([employeeId, rec]) => ({
      employeeId,
      employeeName: rec.name,
      hourlyRate: rec.rate,
      totalHours: round2(rec.total),
      laborCost: round2(rec.total * rec.rate),
      hasOpenEntry: rec.open,
      projects: Array.from(rec.hoursByProject.entries())
        .map(([projectName, hours]) => ({ projectName, hours: round2(hours) }))
        .sort((a, b) => b.hours - a.hours)
    }))
    .sort((a, b) => b.totalHours - a.totalHours || a.employeeName.localeCompare(b.employeeName, 'de'))

  const totalHours = round2(employeeSummaries.reduce((s, e) => s + e.totalHours, 0))
  const totalLaborCost = round2(employeeSummaries.reduce((s, e) => s + e.laborCost, 0))
  const hasOpenEntries = employeeSummaries.some((e) => e.hasOpenEntry)

  // ── Material kumuliert über alle Mitarbeiter ──
  const matMap = new Map<string, DailyMaterialLine>()
  for (const entry of entries) {
    for (const usage of entry.materialUsages || []) {
      const key = usage.materialTypeId || usage.materialName || 'unbekannt'
      const qty = Number(usage.quantity) || 0
      const salesUnit = typeof usage.unitPriceEur === 'number' ? usage.unitPriceEur : undefined
      const purchaseUnit = purchaseUnitPrice(usage)
      const salesCost = salesUnit != null ? qty * salesUnit : 0
      const purchaseCost = purchaseUnit != null ? qty * purchaseUnit : 0
      const existing = matMap.get(key)
      if (existing) {
        existing.quantity += qty
        existing.salesCost += salesCost
        existing.purchaseCost += purchaseCost
        if (existing.salesUnitEur == null && salesUnit != null) existing.salesUnitEur = salesUnit
        if (existing.purchaseUnitEur == null && purchaseUnit != null) existing.purchaseUnitEur = purchaseUnit
        if (purchaseUnit != null) existing.hasPurchase = true
      } else {
        matMap.set(key, {
          key,
          name: usage.materialName || 'Material',
          unitLabel: usage.unitLabel || '',
          quantity: qty,
          salesUnitEur: salesUnit,
          purchaseUnitEur: purchaseUnit,
          salesCost,
          purchaseCost,
          hasPurchase: purchaseUnit != null
        })
      }
    }
  }

  const materials = Array.from(matMap.values())
    .map((m) => ({
      ...m,
      quantity: round2(m.quantity),
      salesCost: round2(m.salesCost),
      purchaseCost: round2(m.purchaseCost)
    }))
    .sort((a, b) => b.salesCost - a.salesCost || a.name.localeCompare(b.name, 'de'))

  const materialSalesTotal = round2(materials.reduce((s, m) => s + m.salesCost, 0))
  const materialPurchaseTotal = round2(
    materials.reduce((s, m) => s + (m.hasPurchase ? m.purchaseCost : 0), 0)
  )
  const materialMarginTotal = round2(
    materials.reduce((s, m) => s + (m.hasPurchase ? m.salesCost - m.purchaseCost : 0), 0)
  )

  return {
    employees: employeeSummaries,
    totalHours,
    totalLaborCost,
    hasOpenEntries,
    materials,
    materialSalesTotal,
    materialPurchaseTotal,
    materialMarginTotal
  }
}
