import type { Customer, Employee, MaterialCredit, Project, TimeEntry } from '../../../../types'
import { convertToDate } from '../reports/reportUtils'
import { roundTimeToStep } from '../../../../utils/timeRounding'
import { getReturnTravelCreditMs } from '../../../../utils/returnTravel'

// TEMPORÄRE DIAGNOSE – reine Auswertungslogik ohne React/Firestore, damit sie
// testbar bleibt. Beantwortet die Frage: Warum zeigt die Nachkalkulation eines
// Projekts nichts an, obwohl Zeit und Material gebucht wurden?
//
// Hintergrund: Nachkalkulation und Projekt-Tagesjournal laden ausschließlich
// über `timeEntries.projectId == <Projekt-Dokument-ID>`. Passt die projectId
// auf den Stempelsätzen nicht zum ausgewerteten Dokument, bleibt der Bericht
// leer – und im Mitarbeiter-Bericht steht kein Projektname.

export type EntryPlacement =
  | 'matched-project'
  | 'customer-small-job'
  | 'no-project'
  | 'dangling-project'

export interface DiagnosticEntryRow {
  id: string
  dateLabel: string
  timeLabel: string
  employeeId: string
  employeeName: string
  projectId: string
  projectLabel: string
  customerId: string
  customerName: string
  hours: number
  materialPositions: number
  notes: string
  placement: EntryPlacement
  /** true, wenn der Satz noch läuft (kein Ausstempeln) */
  isRunning: boolean
}

export interface DiagnosticProjectBlock {
  id: string
  name: string
  client: string
  customerId: string
  customerName: string
  status: string
  isActive: boolean
  heroProjectId: string
  entryCount: number
  totalHours: number
  materialPositions: number
  materialCreditCount: number
  entries: DiagnosticEntryRow[]
}

export interface DiagnosticCustomerBlock {
  id: string
  name: string
  heroCustomerId: string
  entryCount: number
  totalHours: number
  materialPositions: number
  entries: DiagnosticEntryRow[]
}

export interface DanglingProjectGroup {
  projectId: string
  entryCount: number
  totalHours: number
  employees: string[]
  firstDateLabel: string
  lastDateLabel: string
  entries: DiagnosticEntryRow[]
}

export interface ProjectDiagnosticsResult {
  search: string
  generatedAt: Date
  totals: {
    projects: number
    customers: number
    timeEntries: number
    materialCredits: number
  }
  matchedProjects: DiagnosticProjectBlock[]
  matchedCustomers: DiagnosticCustomerBlock[]
  /** Sätze ganz ohne projectId und ohne customerId (leere Projektspalte) */
  entriesWithoutProject: DiagnosticEntryRow[]
  /** projectId zeigt auf ein nicht (mehr) vorhandenes Projektdokument */
  danglingGroups: DanglingProjectGroup[]
  /** Sätze, deren Notiz/Kundenname den Suchbegriff enthält, aber woanders hängen */
  textMatchesElsewhere: DiagnosticEntryRow[]
  /** Material-Buchungen, deren projectId auf kein Projekt zeigt */
  orphanMaterialCredits: MaterialCredit[]
  /** Material-Buchungen auf den gefundenen Projekten */
  matchedMaterialCredits: MaterialCredit[]
  verdicts: string[]
}

const asText = (value: unknown): string => (value == null ? '' : String(value))

const contains = (value: unknown, needle: string): boolean =>
  asText(value).toLowerCase().includes(needle)

export const formatDateLabel = (date: Date | null): string =>
  date ? date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const formatTimeLabel = (date: Date | null): string =>
  date ? date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

/** Arbeitsstunden eines Satzes – identisch zur Nachkalkulation (15-Min-Raster). */
export const diagnosticEntryHours = (entry: TimeEntry): number => {
  const clockIn = convertToDate(entry.clockInTime)
  const clockOut = convertToDate(entry.clockOutTime)
  if (!clockIn || !clockOut) return 0
  const rounded = roundTimeToStep(clockOut).getTime() - roundTimeToStep(clockIn).getTime()
  const ms = rounded - (entry.pauseTotalTime || 0) + getReturnTravelCreditMs(entry)
  return Math.max(0, ms) / 3_600_000
}

const materialPositionCount = (entry: TimeEntry): number =>
  (entry.materialUsages?.length || 0) + (entry.materialCreditUsages?.length || 0)

export const employeeDisplayName = (employee: Employee | undefined, fallbackId: string): string =>
  employee?.name ||
  `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() ||
  fallbackId ||
  '—'

/**
 * Wertet den kompletten Datenbestand gegen einen Suchbegriff aus und ordnet
 * jeden gefundenen Stempelsatz einer der vier Ablagen zu.
 */
export const buildProjectDiagnostics = (input: {
  search: string
  projects: Project[]
  customers: Customer[]
  timeEntries: TimeEntry[]
  employees: Employee[]
  materialCredits: MaterialCredit[]
  now?: Date
}): ProjectDiagnosticsResult => {
  const needle = input.search.trim().toLowerCase()
  const projectsById = new Map(input.projects.map((p) => [p.id, p]))
  const employeesById = new Map(input.employees.map((e) => [e.id || '', e]))

  const projectLabel = (projectId: string): string => {
    if (!projectId) return ''
    const project = projectsById.get(projectId)
    if (!project) return `${projectId} (Projektdokument fehlt!)`
    return project.name || projectId
  }

  const toRow = (entry: TimeEntry, placement: EntryPlacement): DiagnosticEntryRow => {
    const clockIn = convertToDate(entry.clockInTime)
    const clockOut = entry.clockOutTime ? convertToDate(entry.clockOutTime) : null
    return {
      id: entry.id,
      dateLabel: formatDateLabel(clockIn),
      timeLabel: `${formatTimeLabel(clockIn)}–${clockOut ? formatTimeLabel(clockOut) : '(läuft)'}`,
      employeeId: entry.employeeId || '',
      employeeName: employeeDisplayName(employeesById.get(entry.employeeId || ''), entry.employeeId || ''),
      projectId: entry.projectId || '',
      projectLabel: projectLabel(entry.projectId || ''),
      customerId: entry.customerId || '',
      customerName: entry.customerName || '',
      hours: Math.round(diagnosticEntryHours(entry) * 100) / 100,
      materialPositions: materialPositionCount(entry),
      notes: (entry.notes || '').slice(0, 200),
      placement,
      isRunning: entry.clockOutTime == null
    }
  }

  const sortByDate = (a: DiagnosticEntryRow, b: DiagnosticEntryRow): number =>
    a.dateLabel.split('.').reverse().join('').localeCompare(b.dateLabel.split('.').reverse().join(''))

  // --- Treffer in Projekten und Kunden -------------------------------------
  const matchedProjectDocs = needle
    ? input.projects.filter(
        (p) =>
          contains(p.name, needle) ||
          contains(p.client, needle) ||
          contains(p.customerName, needle) ||
          contains(p.address, needle) ||
          contains(p.location, needle) ||
          contains(p.id, needle)
      )
    : []

  const matchedCustomerDocs = needle
    ? input.customers.filter(
        (c) =>
          contains(c.name, needle) ||
          contains(c.companyName, needle) ||
          contains(c.firstName, needle) ||
          contains(c.lastName, needle) ||
          contains(c.address, needle) ||
          contains(c.id, needle)
      )
    : []

  const matchedProjectIds = new Set(matchedProjectDocs.map((p) => p.id))
  const matchedCustomerIds = new Set(matchedCustomerDocs.map((c) => c.id))

  // --- Stempelsätze je Projektdokument (Sicht der Nachkalkulation) ---------
  const matchedProjects: DiagnosticProjectBlock[] = matchedProjectDocs.map((project) => {
    const entries = input.timeEntries
      .filter((e) => e.projectId === project.id)
      .map((e) => toRow(e, 'matched-project'))
      .sort(sortByDate)
    const credits = input.materialCredits.filter((c) => c.projectId === project.id)
    return {
      id: project.id,
      name: project.name || '(ohne Name)',
      client: project.client || '',
      customerId: project.customerId || '',
      customerName: project.customerName || '',
      status: project.status || '',
      isActive: project.isActive !== false,
      heroProjectId: project.heroProjectId || '',
      entryCount: entries.length,
      totalHours: Math.round(entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100,
      materialPositions: entries.reduce((sum, e) => sum + e.materialPositions, 0),
      materialCreditCount: credits.length,
      entries
    }
  })

  // --- Kleinaufträge auf den gefundenen Kunden -----------------------------
  const matchedCustomers: DiagnosticCustomerBlock[] = matchedCustomerDocs.map((customer) => {
    const entries = input.timeEntries
      .filter((e) => !e.projectId && e.customerId === customer.id)
      .map((e) => toRow(e, 'customer-small-job'))
      .sort(sortByDate)
    return {
      id: customer.id,
      name: customer.name || '(ohne Name)',
      heroCustomerId: customer.heroCustomerId || '',
      entryCount: entries.length,
      totalHours: Math.round(entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100,
      materialPositions: entries.reduce((sum, e) => sum + e.materialPositions, 0),
      entries
    }
  })

  // --- Sätze ohne jedes Ziel ----------------------------------------------
  const entriesWithoutProject = input.timeEntries
    .filter((e) => !e.projectId && !e.customerId)
    .map((e) => toRow(e, 'no-project'))
    .sort(sortByDate)

  // --- Sätze mit ins Leere zeigender projectId -----------------------------
  const danglingMap = new Map<string, TimeEntry[]>()
  for (const entry of input.timeEntries) {
    if (!entry.projectId) continue
    if (projectsById.has(entry.projectId)) continue
    const list = danglingMap.get(entry.projectId) || []
    list.push(entry)
    danglingMap.set(entry.projectId, list)
  }

  const danglingGroups: DanglingProjectGroup[] = [...danglingMap.entries()]
    .map(([projectId, entries]) => {
      const rows = entries.map((e) => toRow(e, 'dangling-project')).sort(sortByDate)
      return {
        projectId,
        entryCount: rows.length,
        totalHours: Math.round(rows.reduce((sum, r) => sum + r.hours, 0) * 100) / 100,
        employees: [...new Set(rows.map((r) => r.employeeName))],
        firstDateLabel: rows[0]?.dateLabel || '—',
        lastDateLabel: rows[rows.length - 1]?.dateLabel || '—',
        entries: rows
      }
    })
    .sort((a, b) => b.entryCount - a.entryCount)

  // --- Texttreffer, die woanders liegen ------------------------------------
  const textMatchesElsewhere = needle
    ? input.timeEntries
        .filter((e) => {
          if (matchedProjectIds.has(e.projectId || '')) return false
          if (e.customerId && matchedCustomerIds.has(e.customerId)) return false
          return contains(e.notes, needle) || contains(e.customerName, needle)
        })
        .map((e) => toRow(e, e.projectId ? 'dangling-project' : 'no-project'))
        .sort(sortByDate)
    : []

  // --- Material ------------------------------------------------------------
  const orphanMaterialCredits = input.materialCredits.filter(
    (c) => !c.projectId || !projectsById.has(c.projectId)
  )
  const matchedMaterialCredits = input.materialCredits.filter((c) =>
    matchedProjectIds.has(c.projectId)
  )

  // --- Verdikt -------------------------------------------------------------
  const verdicts: string[] = []
  if (!needle) {
    verdicts.push('Kein Suchbegriff angegeben – bitte Projekt- oder Kundennamen eingeben.')
  } else if (matchedProjectDocs.length === 0 && matchedCustomerDocs.length === 0) {
    verdicts.push(
      `Kein Projekt und kein Kunde enthält "${input.search}". Schreibweise prüfen oder kürzeren Begriff verwenden.`
    )
  }
  if (matchedProjectDocs.length > 1) {
    verdicts.push(
      `${matchedProjectDocs.length} Projektdokumente passen zum Suchbegriff – möglicher Dublette (z. B. von Hand angelegt + über HERO synchronisiert). Die Buchungen liegen dann nur auf einem davon.`
    )
  }
  const emptyMatched = matchedProjects.filter((p) => p.entryCount === 0)
  const filledMatched = matchedProjects.filter((p) => p.entryCount > 0)
  if (emptyMatched.length > 0 && filledMatched.length > 0) {
    verdicts.push(
      `URSACHE: Auf "${emptyMatched[0].name}" liegt kein einziger Stempelsatz, auf "${filledMatched[0].name}" dagegen ${filledMatched[0].entryCount}. In der Nachkalkulation wird das leere Dokument ausgewertet.`
    )
  }
  const customerWithEntries = matchedCustomers.filter((c) => c.entryCount > 0)
  if (customerWithEntries.length > 0) {
    verdicts.push(
      `URSACHE: ${customerWithEntries.reduce((s, c) => s + c.entryCount, 0)} Stempelsätze wurden als Kleinauftrag direkt auf den Kunden "${customerWithEntries[0].name}" gebucht (projectId leer). Solche Sätze erscheinen in KEINER Projekt-Nachkalkulation.`
    )
  }
  if (danglingGroups.length > 0) {
    verdicts.push(
      `${danglingGroups.reduce((s, g) => s + g.entryCount, 0)} Stempelsätze zeigen auf ${danglingGroups.length} Projekt-ID(s), zu denen es kein Projektdokument (mehr) gibt.`
    )
  }
  if (entriesWithoutProject.length > 0) {
    verdicts.push(
      `${entriesWithoutProject.length} Stempelsätze haben weder Projekt noch Kunde – im Mitarbeiter-Bericht bleibt die Projektspalte dort leer.`
    )
  }
  if (verdicts.length === 0 && filledMatched.length > 0) {
    verdicts.push(
      'Die gefundenen Projekte tragen Stempelsätze. Falls die Nachkalkulation trotzdem leer bleibt: Zeitraumfilter prüfen (nur abgeschlossene Sätze im gewählten Zeitraum zählen).'
    )
  }

  return {
    search: input.search,
    generatedAt: input.now || new Date(),
    totals: {
      projects: input.projects.length,
      customers: input.customers.length,
      timeEntries: input.timeEntries.length,
      materialCredits: input.materialCredits.length
    },
    matchedProjects,
    matchedCustomers,
    entriesWithoutProject,
    danglingGroups,
    textMatchesElsewhere,
    orphanMaterialCredits,
    matchedMaterialCredits,
    verdicts
  }
}

const MAX_ROWS_IN_REPORT = 60

const entryLine = (row: DiagnosticEntryRow): string =>
  `    ${row.dateLabel} ${row.timeLabel}  ${row.employeeName}  ${row.hours.toFixed(2)} Std` +
  `  Material: ${row.materialPositions}` +
  `  entryId=${row.id}` +
  (row.projectId ? `  projectId=${row.projectId}` : '  projectId=(leer)') +
  (row.customerId ? `  customerId=${row.customerId} "${row.customerName}"` : '') +
  (row.notes ? `  Notiz: ${row.notes}` : '')

/** Klartext-Bericht zum Kopieren/Weitergeben. */
export const buildDiagnosticsReportText = (result: ProjectDiagnosticsResult): string => {
  const lines: string[] = []
  lines.push('===== DIAGNOSE ZEITERFASSUNG =====')
  lines.push(`Suchbegriff: "${result.search}"`)
  lines.push(`Erstellt: ${result.generatedAt.toLocaleString('de-DE')}`)
  lines.push(
    `Datenbestand: ${result.totals.projects} Projekte, ${result.totals.customers} Kunden, ` +
      `${result.totals.timeEntries} Stempelsätze, ${result.totals.materialCredits} Material-Buchungen`
  )

  lines.push('')
  lines.push('--- BEWERTUNG ---')
  if (result.verdicts.length === 0) lines.push('  (keine Auffälligkeit erkannt)')
  result.verdicts.forEach((v) => lines.push(`  * ${v}`))

  lines.push('')
  lines.push(`--- PASSENDE PROJEKTE (${result.matchedProjects.length}) ---`)
  for (const project of result.matchedProjects) {
    lines.push('')
    lines.push(`  Projekt "${project.name}"`)
    lines.push(`    id            = ${project.id}`)
    lines.push(`    client        = ${project.client || '—'}`)
    lines.push(`    customerId    = ${project.customerId || '—'} "${project.customerName || '—'}"`)
    lines.push(`    status        = ${project.status || '—'} / isActive=${project.isActive}`)
    lines.push(`    heroProjectId = ${project.heroProjectId || '—'}`)
    lines.push(
      `    Stempelsätze  = ${project.entryCount}   Stunden = ${project.totalHours.toFixed(2)}` +
        `   Material an Sätzen = ${project.materialPositions}   Material-Buchungen = ${project.materialCreditCount}`
    )
    if (project.entryCount === 0) {
      lines.push('    >>> Auf diesem Dokument liegt NICHTS – deshalb ist die Nachkalkulation leer.')
    }
    project.entries.slice(0, MAX_ROWS_IN_REPORT).forEach((row) => lines.push(entryLine(row)))
    if (project.entries.length > MAX_ROWS_IN_REPORT) {
      lines.push(`    … und ${project.entries.length - MAX_ROWS_IN_REPORT} weitere`)
    }
  }

  lines.push('')
  lines.push(`--- PASSENDE KUNDEN / KLEINAUFTRÄGE (${result.matchedCustomers.length}) ---`)
  for (const customer of result.matchedCustomers) {
    lines.push('')
    lines.push(`  Kunde "${customer.name}"  id=${customer.id}  hero=${customer.heroCustomerId || '—'}`)
    lines.push(
      `    Kleinauftrags-Sätze = ${customer.entryCount}   Stunden = ${customer.totalHours.toFixed(2)}` +
        `   Material = ${customer.materialPositions}`
    )
    if (customer.entryCount > 0) {
      lines.push('    >>> Diese Sätze erscheinen in KEINER Projekt-Nachkalkulation.')
    }
    customer.entries.slice(0, MAX_ROWS_IN_REPORT).forEach((row) => lines.push(entryLine(row)))
    if (customer.entries.length > MAX_ROWS_IN_REPORT) {
      lines.push(`    … und ${customer.entries.length - MAX_ROWS_IN_REPORT} weitere`)
    }
  }

  lines.push('')
  lines.push(`--- STEMPELSÄTZE OHNE PROJEKT UND OHNE KUNDE (${result.entriesWithoutProject.length}) ---`)
  result.entriesWithoutProject
    .slice(0, MAX_ROWS_IN_REPORT)
    .forEach((row) => lines.push(entryLine(row)))
  if (result.entriesWithoutProject.length > MAX_ROWS_IN_REPORT) {
    lines.push(`    … und ${result.entriesWithoutProject.length - MAX_ROWS_IN_REPORT} weitere`)
  }

  lines.push('')
  lines.push(`--- PROJEKT-IDs OHNE PROJEKTDOKUMENT (${result.danglingGroups.length}) ---`)
  for (const group of result.danglingGroups) {
    lines.push(
      `  projectId=${group.projectId}  ${group.entryCount} Sätze  ${group.totalHours.toFixed(2)} Std` +
        `  ${group.firstDateLabel} bis ${group.lastDateLabel}  Mitarbeiter: ${group.employees.join(', ')}`
    )
    group.entries.slice(0, 15).forEach((row) => lines.push(entryLine(row)))
    if (group.entries.length > 15) {
      lines.push(`    … und ${group.entries.length - 15} weitere`)
    }
  }

  lines.push('')
  lines.push(`--- TEXT-TREFFER AUSSERHALB DER GEFUNDENEN PROJEKTE (${result.textMatchesElsewhere.length}) ---`)
  result.textMatchesElsewhere.slice(0, 30).forEach((row) => lines.push(entryLine(row)))
  if (result.textMatchesElsewhere.length > 30) {
    lines.push(`    … und ${result.textMatchesElsewhere.length - 30} weitere`)
  }

  lines.push('')
  lines.push(`--- MATERIAL-BUCHUNGEN AUF DEN GEFUNDENEN PROJEKTEN (${result.matchedMaterialCredits.length}) ---`)
  result.matchedMaterialCredits.slice(0, 40).forEach((credit) => {
    lines.push(
      `    ${formatDateLabel(convertToDate(credit.createdAt))}  ${credit.materialName || '—'}` +
        `  ${credit.quantity ?? 0} ${credit.unitLabel || ''}  kind=${credit.kind || 'credit'}` +
        `  projectId=${credit.projectId}`
    )
  })

  lines.push('')
  lines.push(`--- MATERIAL-BUCHUNGEN OHNE GÜLTIGES PROJEKT (${result.orphanMaterialCredits.length}) ---`)
  result.orphanMaterialCredits.slice(0, 40).forEach((credit) => {
    lines.push(
      `    ${formatDateLabel(convertToDate(credit.createdAt))}  ${credit.materialName || '—'}` +
        `  ${credit.quantity ?? 0} ${credit.unitLabel || ''}  projectId=${credit.projectId || '(leer)'}`
    )
  })

  lines.push('')
  lines.push('===== ENDE =====')
  return lines.join('\n')
}
