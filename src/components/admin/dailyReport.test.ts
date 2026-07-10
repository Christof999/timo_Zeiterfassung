import { describe, it, expect } from 'vitest'
import { buildDailyReport } from './dailyReport'
import type { Employee, MaterialType, Project, TimeEntry } from '../../types'

const today = new Date(2026, 6, 10)
const at = (h: number, m: number) => new Date(2026, 6, 10, h, m, 0, 0)

const employees: Employee[] = [
  { id: 'e1', username: 'niko', name: 'Niko', hourlyWage: 40 },
  { id: 'e2', username: 'timo', name: 'Timo', hourlyRate: 30 }
]

const projects: Project[] = [
  { id: 'p1', name: 'BV Strobel' },
  { id: 'p2', name: 'BV Wilhelm-Löhe-Schule' }
]

const materialTypes: MaterialType[] = [
  { id: 'm1', name: 'Flexkleber M21', unitLabel: 'Sack', unitPriceEur: 22, purchasePriceEur: 16 },
  { id: 'm2', name: 'Fliesen', unitLabel: 'm²', unitPriceEur: 30 } // kein Einkaufspreis
]

const entry = (over: Partial<TimeEntry>): TimeEntry =>
  ({
    id: Math.random().toString(36).slice(2),
    employeeId: 'e1',
    projectId: 'p1',
    clockInTime: at(8, 0),
    clockOutTime: at(16, 0),
    pauseTotalTime: 30 * 60 * 1000,
    ...over
  }) as TimeEntry

describe('buildDailyReport – Stunden & Lohn', () => {
  it('summiert Stunden je Mitarbeiter und rechnet Lohn hoch', () => {
    const entries = [
      entry({ employeeId: 'e1', projectId: 'p1' }), // 8:00–16:00, 30min Pause = 7,5 h
      entry({ employeeId: 'e2', projectId: 'p2', clockInTime: at(7, 0), clockOutTime: at(12, 0), pauseTotalTime: 0 }) // 5 h
    ]
    const r = buildDailyReport(entries, employees, projects, materialTypes, today)

    const niko = r.employees.find((e) => e.employeeId === 'e1')!
    const timo = r.employees.find((e) => e.employeeId === 'e2')!
    expect(niko.totalHours).toBe(7.5)
    expect(niko.laborCost).toBe(300) // 7,5 × 40
    expect(timo.totalHours).toBe(5)
    expect(timo.laborCost).toBe(150) // 5 × 30

    expect(r.totalHours).toBe(12.5)
    expect(r.totalLaborCost).toBe(450)
    expect(r.hasOpenEntries).toBe(false)
  })

  it('gruppiert Stunden je Projekt pro Mitarbeiter', () => {
    const entries = [
      entry({ employeeId: 'e1', projectId: 'p1', clockInTime: at(8, 0), clockOutTime: at(12, 0), pauseTotalTime: 0 }),
      entry({ employeeId: 'e1', projectId: 'p2', clockInTime: at(13, 0), clockOutTime: at(16, 0), pauseTotalTime: 0 })
    ]
    const r = buildDailyReport(entries, employees, projects, materialTypes, today)
    const niko = r.employees.find((e) => e.employeeId === 'e1')!
    expect(niko.totalHours).toBe(7)
    const byName = new Map(niko.projects.map((p) => [p.projectName, p.hours]))
    expect(byName.get('BV Strobel')).toBe(4)
    expect(byName.get('BV Wilhelm-Löhe-Schule')).toBe(3)
  })

  it('zählt offene Einträge bis jetzt und markiert sie', () => {
    const now = at(12, 0)
    const entries = [
      entry({ employeeId: 'e1', clockInTime: at(8, 0), clockOutTime: null, pauseTotalTime: 0 })
    ]
    const r = buildDailyReport(entries, employees, projects, materialTypes, now)
    expect(r.hasOpenEntries).toBe(true)
    expect(r.employees[0].hasOpenEntry).toBe(true)
    expect(r.employees[0].totalHours).toBe(4) // 8:00–12:00
  })

  it('ignoriert Urlaubstage', () => {
    const entries = [entry({ isVacationDay: true })]
    const r = buildDailyReport(entries, employees, projects, materialTypes, today)
    expect(r.employees).toHaveLength(0)
    expect(r.totalHours).toBe(0)
  })
})

describe('buildDailyReport – Material & Marge', () => {
  it('kumuliert Material über alle Mitarbeiter und berechnet Marge nur mit Einkaufspreis', () => {
    const entries = [
      entry({
        employeeId: 'e1',
        materialUsages: [
          { materialTypeId: 'm1', materialName: 'Flexkleber M21', unitLabel: 'Sack', quantity: 2, unitPriceEur: 22 }
        ]
      }),
      entry({
        employeeId: 'e2',
        materialUsages: [
          { materialTypeId: 'm1', materialName: 'Flexkleber M21', unitLabel: 'Sack', quantity: 3, unitPriceEur: 22 },
          { materialTypeId: 'm2', materialName: 'Fliesen', unitLabel: 'm²', quantity: 10, unitPriceEur: 30 }
        ]
      })
    ]
    const r = buildDailyReport(entries, employees, projects, materialTypes, today)

    const kleber = r.materials.find((m) => m.name === 'Flexkleber M21')!
    expect(kleber.quantity).toBe(5) // 2 + 3
    expect(kleber.salesCost).toBe(110) // 5 × 22
    expect(kleber.purchaseCost).toBe(80) // 5 × 16
    expect(kleber.hasPurchase).toBe(true)

    const fliesen = r.materials.find((m) => m.name === 'Fliesen')!
    expect(fliesen.hasPurchase).toBe(false)
    expect(fliesen.salesCost).toBe(300)

    // Verkauf gesamt = 110 + 300; Einkauf/Marge nur aus Positionen mit Einkaufspreis
    expect(r.materialSalesTotal).toBe(410)
    expect(r.materialPurchaseTotal).toBe(80)
    expect(r.materialMarginTotal).toBe(30) // 110 − 80
  })

  it('löst Einkaufspreis auch per Name auf (Freitext ohne materialTypeId)', () => {
    const entries = [
      entry({
        materialUsages: [
          { materialTypeId: '', materialName: 'flexkleber m21', unitLabel: 'Sack', quantity: 1, unitPriceEur: 22 }
        ]
      })
    ]
    const r = buildDailyReport(entries, employees, projects, materialTypes, today)
    expect(r.materials[0].purchaseCost).toBe(16)
    expect(r.materialMarginTotal).toBe(6)
  })
})
