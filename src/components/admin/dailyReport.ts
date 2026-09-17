import type { Employee, MaterialType, OverheadProjectKind, Project, TimeEntry } from '../../types'
import { roundedSpanMs } from '../../utils/timeRounding'
import { getReturnTravelCreditMs } from '../../utils/returnTravel'
import { employeeBillingRate, employeeLaborCostRate } from './tabs/reports/reportUtils'
import { OVERHEAD_PROJECT_LABELS, overheadKindOf } from '../../constants/overheadProjects'

// Reine Berechnungslogik für den Tagesbericht (Admin-Dashboard). Bewusst ohne
// React/Firestore, damit sie testbar bleibt. Basis: die heutigen Zeiteinträge.

export interface DailyEmployeeProjectLine {
  projectName: string
  hours: number
  /** true für Nachbesserung/Lager – diese Stunden werden nicht verrechnet */
  isOverhead: boolean
}

export interface DailyEmployeeSummary {
  employeeId: string
  employeeName: string
  /** Verrechnungssatz (EUR/Std) – was die Stunde dem Kunden berechnet wird */
  hourlyRate: number
  totalHours: number
  /** Stunden auf echten Projekten/Kleinaufträgen – nur diese werden verrechnet */
  billableHours: number
  /** Stunden auf Nachbesserung/Lager – Kosten ohne Ertrag */
  overheadHours: number
  /** Verrechenbare Stunden × Verrechnungssatz = Umsatz aus der Arbeitszeit */
  laborCost: number
  /** Lohnkosten je Std = Kostensatz + Lohnnebenkosten; 0 wenn nicht hinterlegt */
  hourlyCostRate: number
  /** Alle Stunden × Lohnkostensatz = was der Mitarbeiter heute wirklich kostet */
  laborPurchaseCost: number
  /** Gemeinkosten-Stunden × Lohnkostensatz (Teilmenge von `laborPurchaseCost`) */
  overheadCost: number
  /** true, wenn Lohnkosten hinterlegt sind (nur dann gibt es eine Marge) */
  hasCostRate: boolean
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

/** Nachbesserung bzw. Lager mit den heute darauf gebuchten Stunden und Kosten. */
export interface DailyOverheadLine {
  kind: OverheadProjectKind
  name: string
  hours: number
  /** Stunden × Lohnkostensatz; nur Mitarbeiter mit hinterlegten Lohnkosten */
  cost: number
}

export interface DailyReportData {
  employees: DailyEmployeeSummary[]
  totalHours: number
  /** Summe Stunden × Verrechnungssatz */
  totalLaborCost: number
  /** Summe der Lohnkosten – nur Mitarbeiter mit hinterlegtem Lohnkostensatz */
  totalLaborPurchaseCost: number
  /** Verrechnung − Lohnkosten, nur über Mitarbeiter mit hinterlegten Lohnkosten */
  totalLaborMarginTotal: number
  /** Stunden auf Nachbesserung/Lager (in `totalHours` enthalten) */
  totalOverheadHours: number
  /** Lohnkosten der Gemeinkosten-Stunden – Kosten, denen kein Ertrag gegenübersteht */
  totalOverheadCost: number
  /** Aufteilung der Gemeinkosten-Stunden auf Nachbesserung und Lager */
  overheadProjects: DailyOverheadLine[]
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

  /**
   * Nachbesserung/Lager erkennen. Ein Kleinauftrag (Buchung direkt am Kunden)
   * ist nie Gemeinkosten – dort steht ein Kunde und damit ein Ertrag dahinter.
   */
  const entryOverheadKind = (entry: TimeEntry): OverheadProjectKind | null => {
    if (!entry.projectId) return null
    const project = projects.find((p) => p.id === entry.projectId)
    return project ? overheadKindOf(project) : null
  }

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
  type ProjectRec = { hours: number; isOverhead: boolean }
  type EmpRec = {
    name: string
    /** Verrechnungssatz – der Verkaufspreis der Stunde */
    rate: number
    /** Lohnkosten je Std = Kostensatz + Lohnnebenkosten */
    costRate: number
    hoursByProject: Map<string, ProjectRec>
    total: number
    /** Stunden auf Nachbesserung/Lager – ohne Verrechnung, aber mit Kosten */
    overhead: number
    open: boolean
  }
  const empMap = new Map<string, EmpRec>()
  /** Gemeinkosten-Stunden je Art, zusammen mit den zugehörigen Lohnkosten. */
  const overheadMap = new Map<OverheadProjectKind, { hours: number; cost: number }>()

  for (const entry of entries) {
    if (entry.isVacationDay) continue
    const hours = workedMs(entry, now) / (1000 * 60 * 60)
    const emp = employees.find((e) => e.id === entry.employeeId)
    const name =
      emp?.name || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || entry.employeeId
    const rate = employeeBillingRate(emp)
    const costRate = employeeLaborCostRate(emp)
    const overheadKind = entryOverheadKind(entry)
    let rec = empMap.get(entry.employeeId)
    if (!rec) {
      rec = { name, rate, costRate, hoursByProject: new Map(), total: 0, overhead: 0, open: false }
      empMap.set(entry.employeeId, rec)
    }
    rec.total += hours
    if (overheadKind) {
      rec.overhead += hours
      const bucket = overheadMap.get(overheadKind) || { hours: 0, cost: 0 }
      bucket.hours += hours
      bucket.cost += hours * costRate
      overheadMap.set(overheadKind, bucket)
    }
    const pName =
      entry.customerId && !entry.projectId
        ? `Kleinauftrag: ${entry.customerName || 'Kunde'}`
        : projectName(entry.projectId)
    const projectRec = rec.hoursByProject.get(pName) || { hours: 0, isOverhead: !!overheadKind }
    projectRec.hours += hours
    rec.hoursByProject.set(pName, projectRec)
    if (!entry.clockOutTime) rec.open = true
  }

  const employeeSummaries: DailyEmployeeSummary[] = Array.from(empMap.entries())
    .map(([employeeId, rec]) => {
      const billable = Math.max(0, rec.total - rec.overhead)
      return {
        employeeId,
        employeeName: rec.name,
        hourlyRate: rec.rate,
        totalHours: round2(rec.total),
        billableHours: round2(billable),
        overheadHours: round2(rec.overhead),
        // Nachbesserung und Lager werden niemandem berechnet – nur die
        // verrechenbaren Stunden gehen in den Ertrag ein.
        laborCost: round2(billable * rec.rate),
        hourlyCostRate: rec.costRate,
        laborPurchaseCost: round2(rec.total * rec.costRate),
        overheadCost: round2(rec.overhead * rec.costRate),
        hasCostRate: rec.costRate > 0,
        hasOpenEntry: rec.open,
        projects: Array.from(rec.hoursByProject.entries())
          .map(([projectName, projectRec]) => ({
            projectName,
            hours: round2(projectRec.hours),
            isOverhead: projectRec.isOverhead
          }))
          .sort((a, b) => b.hours - a.hours)
      }
    })
    .sort((a, b) => b.totalHours - a.totalHours || a.employeeName.localeCompare(b.employeeName, 'de'))

  const totalHours = round2(employeeSummaries.reduce((s, e) => s + e.totalHours, 0))
  const totalLaborCost = round2(employeeSummaries.reduce((s, e) => s + e.laborCost, 0))
  const totalOverheadHours = round2(employeeSummaries.reduce((s, e) => s + e.overheadHours, 0))
  // Wie bei den übrigen Lohnkosten: ohne hinterlegten Kostensatz bleibt die
  // Stunde außen vor, sonst stünde dort eine erfundene Zahl.
  const totalOverheadCost = round2(
    employeeSummaries.reduce((s, e) => s + (e.hasCostRate ? e.overheadCost : 0), 0)
  )
  const overheadProjects: DailyOverheadLine[] = Array.from(overheadMap.entries())
    .map(([kind, bucket]) => ({
      kind,
      name: OVERHEAD_PROJECT_LABELS[kind],
      hours: round2(bucket.hours),
      cost: round2(bucket.cost)
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'de'))
  // Wie beim Material: ohne hinterlegten Gegenwert gibt es keine Marge, und die
  // Zeile darf die Summe dann auch nicht verfälschen.
  const totalLaborPurchaseCost = round2(
    employeeSummaries.reduce((s, e) => s + (e.hasCostRate ? e.laborPurchaseCost : 0), 0)
  )
  const totalLaborMarginTotal = round2(
    employeeSummaries.reduce((s, e) => s + (e.hasCostRate ? e.laborCost - e.laborPurchaseCost : 0), 0)
  )
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
    totalLaborPurchaseCost,
    totalLaborMarginTotal,
    totalOverheadHours,
    totalOverheadCost,
    overheadProjects,
    hasOpenEntries,
    materials,
    materialSalesTotal,
    materialPurchaseTotal,
    materialMarginTotal
  }
}
