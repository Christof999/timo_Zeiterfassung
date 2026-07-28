import { describe, it, expect } from 'vitest'
import { buildProjectDiagnostics, buildDiagnosticsReportText } from './projectDiagnostics'
import type { Customer, Employee, MaterialCredit, Project, TimeEntry } from '../../../../types'

// Die Diagnose muss die drei Ursachen sauber auseinanderhalten, warum eine
// Projekt-Nachkalkulation leer bleibt: Dublette, Kleinauftrag, verwaiste ID.

const employees: Employee[] = [
  { id: 'mit-1', name: 'Max Muster', username: 'mmuster' } as Employee
]

const entry = (over: Partial<TimeEntry>): TimeEntry =>
  ({
    id: 'x',
    employeeId: 'mit-1',
    projectId: '',
    clockInTime: new Date(2026, 6, 8, 7, 0),
    clockOutTime: new Date(2026, 6, 8, 16, 0),
    pauseTotalTime: 30 * 60 * 1000,
    ...over
  }) as TimeEntry

const baseInput = {
  search: 'Strobel',
  projects: [] as Project[],
  customers: [] as Customer[],
  timeEntries: [] as TimeEntry[],
  employees,
  materialCredits: [] as MaterialCredit[],
  now: new Date(2026, 6, 28, 12, 0)
}

describe('buildProjectDiagnostics – Dublette erkennen', () => {
  const result = buildProjectDiagnostics({
    ...baseInput,
    projects: [
      { id: 'proj-manuell', name: 'BV Strobel Hattenhof', client: 'Andreas Strobel' } as Project,
      { id: 'proj-hero', name: '4711 – Andreas Strobel', heroProjectId: '4711' } as Project
    ],
    timeEntries: [
      entry({ id: 'e1', projectId: 'proj-hero' }),
      entry({ id: 'e2', projectId: 'proj-hero' })
    ]
  })

  it('findet beide Projektdokumente', () => {
    expect(result.matchedProjects).toHaveLength(2)
  })

  it('ordnet die Buchungen dem richtigen Dokument zu', () => {
    const manuell = result.matchedProjects.find((p) => p.id === 'proj-manuell')
    const hero = result.matchedProjects.find((p) => p.id === 'proj-hero')
    expect(manuell?.entryCount).toBe(0)
    expect(hero?.entryCount).toBe(2)
    // 07:00–16:00 minus 30 Min Pause = 8,5 Std je Satz
    expect(hero?.totalHours).toBeCloseTo(17, 2)
  })

  it('benennt die Dublette in der Bewertung', () => {
    expect(result.verdicts.join(' ')).toMatch(/Dublette/i)
    expect(result.verdicts.join(' ')).toMatch(/kein einziger Stempelsatz/i)
  })
})

describe('buildProjectDiagnostics – Kleinauftrag erkennen', () => {
  const result = buildProjectDiagnostics({
    ...baseInput,
    projects: [{ id: 'proj-1', name: 'BV Strobel Hattenhof', client: 'Andreas Strobel' } as Project],
    customers: [{ id: 'kunde-1', name: 'Andreas Strobel' } as Customer],
    timeEntries: [
      entry({ id: 'e1', projectId: '', customerId: 'kunde-1', customerName: 'Andreas Strobel' })
    ]
  })

  it('zählt die Kleinauftrags-Buchung beim Kunden', () => {
    expect(result.matchedCustomers[0].entryCount).toBe(1)
    expect(result.matchedProjects[0].entryCount).toBe(0)
  })

  it('weist in der Bewertung auf den Kleinauftrag hin', () => {
    expect(result.verdicts.join(' ')).toMatch(/Kleinauftrag/i)
  })

  it('führt den Satz nicht zusätzlich als "ohne Projekt und ohne Kunde"', () => {
    expect(result.entriesWithoutProject).toHaveLength(0)
  })
})

describe('buildProjectDiagnostics – verwaiste und projektlose Sätze', () => {
  const result = buildProjectDiagnostics({
    ...baseInput,
    projects: [{ id: 'proj-1', name: 'BV Strobel Hattenhof' } as Project],
    timeEntries: [
      entry({ id: 'e1', projectId: 'geloeschte-id' }),
      entry({ id: 'e2', projectId: 'geloeschte-id' }),
      entry({ id: 'e3', projectId: '' })
    ]
  })

  it('gruppiert Sätze mit fehlendem Projektdokument', () => {
    expect(result.danglingGroups).toHaveLength(1)
    expect(result.danglingGroups[0].projectId).toBe('geloeschte-id')
    expect(result.danglingGroups[0].entryCount).toBe(2)
  })

  it('listet Sätze ohne Projekt und ohne Kunde getrennt', () => {
    expect(result.entriesWithoutProject.map((r) => r.id)).toEqual(['e3'])
  })
})

describe('buildProjectDiagnostics – Material', () => {
  it('trennt Buchungen auf gefundenen Projekten von verwaisten', () => {
    const result = buildProjectDiagnostics({
      ...baseInput,
      projects: [{ id: 'proj-1', name: 'BV Strobel Hattenhof' } as Project],
      materialCredits: [
        { id: 'm1', projectId: 'proj-1', materialName: 'Fliesenkleber', quantity: 5 } as MaterialCredit,
        { id: 'm2', projectId: 'weg', materialName: 'Silikon', quantity: 2 } as MaterialCredit
      ]
    })
    expect(result.matchedMaterialCredits.map((c) => c.id)).toEqual(['m1'])
    expect(result.orphanMaterialCredits.map((c) => c.id)).toEqual(['m2'])
  })
})

describe('buildDiagnosticsReportText', () => {
  it('enthält IDs, Bewertung und Abschnitte zum Weitergeben', () => {
    const result = buildProjectDiagnostics({
      ...baseInput,
      projects: [{ id: 'proj-1', name: 'BV Strobel Hattenhof', client: 'Andreas Strobel' } as Project],
      customers: [{ id: 'kunde-1', name: 'Andreas Strobel' } as Customer],
      timeEntries: [entry({ id: 'e1', projectId: '', customerId: 'kunde-1' })]
    })
    const text = buildDiagnosticsReportText(result)

    expect(text).toContain('DIAGNOSE ZEITERFASSUNG')
    expect(text).toContain('Suchbegriff: "Strobel"')
    expect(text).toContain('proj-1')
    expect(text).toContain('kunde-1')
    expect(text).toContain('entryId=e1')
    expect(text).toContain('--- BEWERTUNG ---')
    expect(text.trimEnd().endsWith('===== ENDE =====')).toBe(true)
  })
})
