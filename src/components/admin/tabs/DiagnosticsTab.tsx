import { useMemo, useState } from 'react'
import { DataService } from '../../../services/dataService'
import type { Project } from '../../../types'
import { toast } from '../../ToastContainer'
import SearchableSelect, { type SearchableOption } from '../../SearchableSelect'
import {
  buildProjectDiagnostics,
  buildDiagnosticsReportText,
  type ProjectDiagnosticsResult,
  type DiagnosticEntryRow
} from './diagnostics/projectDiagnostics'
import '../../../styles/AdminTabs.css'
import '../../../styles/DiagnosticsTab.css'

interface MoveSource {
  type: 'customer' | 'project'
  id: string
  label: string
  entryCount: number
  totalHours: number
  materialPositions: number
}

/**
 * TEMPORÄRE DIAGNOSE-SEITE.
 *
 * Zeigt, wo die Stempelsätze und Material-Buchungen zu einem Projekt/Kunden
 * tatsächlich liegen. Hintergrund: Nachkalkulation und Projekt-Tagesjournal
 * laden ausschließlich über `timeEntries.projectId == <Projekt-Dokument-ID>`.
 *
 * Diese Seite liest nur – sie ändert nichts. Sie kann jederzeit wieder
 * entfernt werden (Tab-Eintrag in AdminDashboard.tsx + dieser Ordner).
 */
const DiagnosticsTab: React.FC = () => {
  const [search, setSearch] = useState('Strobel')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ProjectDiagnosticsResult | null>(null)
  const [reportText, setReportText] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  // Zielprojekt je Quelle (Kunde/Projekt), damit mehrere Blöcke unabhängig sind
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({})
  const [movingKey, setMovingKey] = useState<string | null>(null)
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number } | null>(null)

  const projectOptions: SearchableOption[] = useMemo(
    () =>
      [...projects]
        .filter((p) => p.id)
        .sort((a, b) => {
          const aArchived = a.status === 'archived' || a.isActive === false
          const bArchived = b.status === 'archived' || b.isActive === false
          if (aArchived !== bArchived) return aArchived ? 1 : -1
          return (a.name || '').localeCompare(b.name || '', 'de')
        })
        .map((p) => ({
          value: p.id,
          label:
            (p.name || p.id) +
            (p.client ? ` (${p.client})` : '') +
            (p.status === 'archived' || p.isActive === false ? ' — archiviert' : '')
        })),
    [projects]
  )

  const handleRun = async () => {
    if (!search.trim()) {
      toast.error('Bitte einen Suchbegriff eingeben (z. B. Projekt- oder Kundenname).')
      return
    }

    setIsLoading(true)
    try {
      const [projects, customers, timeEntries, employees, materialCredits] = await Promise.all([
        DataService.getAllProjects(),
        DataService.getAllCustomers(),
        DataService.getAllTimeEntries(),
        DataService.getAllEmployees(),
        DataService.getAllMaterialCredits()
      ])

      const diagnostics = buildProjectDiagnostics({
        search: search.trim(),
        projects,
        customers,
        timeEntries,
        employees,
        materialCredits
      })

      setProjects(projects)
      setResult(diagnostics)
      setReportText(buildDiagnosticsReportText(diagnostics))
      toast.success('Diagnose fertig.')
    } catch (error: any) {
      console.error('Diagnose fehlgeschlagen:', error)
      toast.error(error?.message || 'Diagnose fehlgeschlagen.')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Alles einer Quelle (Kunde/Projekt) auf ein Zielprojekt umbuchen:
   * Stempelsätze inkl. Material, Fotos, Dokumente und Fahrzeugbuchungen.
   */
  const handleMove = async (source: MoveSource) => {
    const key = `${source.type}:${source.id}`
    const targetProjectId = moveTargets[key]
    if (!targetProjectId) {
      toast.error('Bitte zuerst ein Zielprojekt wählen.')
      return
    }
    if (source.type === 'project' && targetProjectId === source.id) {
      toast.error('Quelle und Ziel sind dasselbe Projekt.')
      return
    }

    const targetName =
      projects.find((p) => p.id === targetProjectId)?.name || targetProjectId

    const confirmed = window.confirm(
      `${source.entryCount} Stempelsätze (${source.totalHours.toFixed(2)} Std, ` +
        `${source.materialPositions} Material-Positionen)\n` +
        `von „${source.label}"\n` +
        `auf das Projekt „${targetName}" umbuchen?\n\n` +
        'Fotos, Dokumente und Fahrzeugbuchungen werden mitgenommen.\n' +
        'Diese Aktion lässt sich nicht automatisch rückgängig machen.'
    )
    if (!confirmed) return

    setMovingKey(key)
    setMoveProgress({ done: 0, total: source.entryCount })
    try {
      const admin = await DataService.getCurrentAdmin()
      const moveResult = await DataService.moveBookingsToProject({
        source: { type: source.type, id: source.id },
        targetProjectId,
        correctedBy: { id: admin?.id, name: admin?.name },
        onProgress: (done, total) => setMoveProgress({ done, total })
      })

      const moved = moveResult.movedEntries + moveResult.movedRunningEntries
      if (moveResult.failed.length === 0) {
        toast.success(
          `${moved} von ${moveResult.total} Stempelsätzen auf „${targetName}" umgebucht.`
        )
      } else {
        toast.error(
          `${moved} umgebucht, ${moveResult.failed.length} fehlgeschlagen. Details siehe Browser-Konsole.`
        )
        console.error('Nicht umgebuchte Stempelsätze:', moveResult.failed)
      }

      // Diagnose neu laden, damit das Ergebnis sofort sichtbar ist
      await handleRun()
    } catch (error: any) {
      console.error('Umbuchen fehlgeschlagen:', error)
      toast.error(error?.message || 'Umbuchen fehlgeschlagen.')
    } finally {
      setMovingKey(null)
      setMoveProgress(null)
    }
  }

  const renderMovePanel = (source: MoveSource) => {
    const key = `${source.type}:${source.id}`
    const isMoving = movingKey === key
    const isBlocked = movingKey !== null && !isMoving
    return (
      <div className="diag-move">
        <h5>Alles auf ein Projekt umbuchen</h5>
        <p className="diag-move-summary">
          {source.entryCount} Stempelsätze · {source.totalHours.toFixed(2)} Std ·{' '}
          {source.materialPositions} Material-Positionen · inkl. Fotos, Dokumente und
          Fahrzeugbuchungen
        </p>
        <div className="diag-move-row">
          <SearchableSelect
            id={`diag-move-${key}`}
            options={projectOptions.filter(
              (option) => !(source.type === 'project' && option.value === source.id)
            )}
            value={moveTargets[key] || ''}
            onChange={(value) => setMoveTargets((prev) => ({ ...prev, [key]: value }))}
            placeholder="Zielprojekt wählen"
            searchPlaceholder="Projekt suchen…"
            emptyText="Kein Projekt gefunden"
          />
          <button
            type="button"
            className="btn primary-btn"
            onClick={() => void handleMove(source)}
            disabled={isMoving || isBlocked || !moveTargets[key] || source.entryCount === 0}
          >
            {isMoving
              ? `Bucht um… ${moveProgress?.done ?? 0}/${moveProgress?.total ?? source.entryCount}`
              : 'Jetzt umbuchen'}
          </button>
        </div>
      </div>
    )
  }

  const handleCopy = async () => {
    if (!reportText) return
    try {
      await navigator.clipboard.writeText(reportText)
      toast.success('Bericht in die Zwischenablage kopiert.')
    } catch {
      toast.error('Kopieren nicht möglich – bitte den Text unten markieren und kopieren.')
    }
  }

  const handleDownload = () => {
    if (!reportText) return
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `diagnose-${search.trim().replace(/\W+/g, '-').toLowerCase()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const renderEntryTable = (rows: DiagnosticEntryRow[], emptyText: string) => {
    if (rows.length === 0) return <p className="diag-empty">{emptyText}</p>
    return (
      <div className="diag-table-wrap">
        <table className="diag-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Zeiten</th>
              <th>Mitarbeiter</th>
              <th>Std</th>
              <th>Mat.</th>
              <th>projectId</th>
              <th>customerId</th>
              <th>Stempelsatz-ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row) => (
              <tr key={row.id} className={row.isRunning ? 'diag-running' : ''}>
                <td>{row.dateLabel}</td>
                <td>{row.timeLabel}</td>
                <td>{row.employeeName}</td>
                <td className="diag-num">{row.hours.toFixed(2)}</td>
                <td className="diag-num">{row.materialPositions}</td>
                <td className="diag-mono">{row.projectId || '(leer)'}</td>
                <td className="diag-mono">
                  {row.customerId ? `${row.customerId} „${row.customerName}"` : '—'}
                </td>
                <td className="diag-mono">{row.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 100 && (
          <p className="diag-empty">… und {rows.length - 100} weitere (vollständig im Textbericht)</p>
        )}
      </div>
    )
  }

  return (
    <div className="diagnostics-tab">
      <div className="diag-banner">
        <strong>Temporäre Diagnose-Seite.</strong> Liest nur, ändert nichts. Bitte den erzeugten
        Textbericht kopieren und zur Auswertung weitergeben. Die Seite kann danach wieder entfernt
        werden.
      </div>

      <div className="diag-filters">
        <label htmlFor="diag-search">Projekt oder Kunde suchen:</label>
        <div className="diag-filter-row">
          <input
            id="diag-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRun()
            }}
            placeholder="z. B. Strobel"
          />
          <button type="button" className="btn primary-btn" onClick={handleRun} disabled={isLoading}>
            {isLoading ? 'Analysiert…' : 'Diagnose starten'}
          </button>
        </div>
        <small className="diag-hint">
          Kurzer Begriff genügt (z. B. nur der Nachname). Gesucht wird in Projektname, Kunde,
          Adresse, Kundenname und in den Notizen der Stempelsätze.
        </small>
      </div>

      {isLoading && <p className="diag-empty">Alle Projekte, Kunden und Stempelsätze werden geladen…</p>}

      {result && !isLoading && (
        <>
          <section className="diag-section diag-verdict">
            <h3>Bewertung</h3>
            {result.verdicts.length === 0 ? (
              <p className="diag-empty">Keine Auffälligkeit erkannt.</p>
            ) : (
              <ul>
                {result.verdicts.map((verdict, index) => (
                  <li key={index}>{verdict}</li>
                ))}
              </ul>
            )}
            <p className="diag-totals">
              Datenbestand: {result.totals.projects} Projekte · {result.totals.customers} Kunden ·{' '}
              {result.totals.timeEntries} Stempelsätze · {result.totals.materialCredits}{' '}
              Material-Buchungen
            </p>
          </section>

          <section className="diag-section">
            <h3>Passende Projekte ({result.matchedProjects.length})</h3>
            {result.matchedProjects.length === 0 && (
              <p className="diag-empty">Kein Projektdokument enthält „{result.search}".</p>
            )}
            {result.matchedProjects.map((project) => (
              <div key={project.id} className="diag-card">
                <h4>
                  {project.name}
                  {project.entryCount === 0 && <span className="diag-flag">keine Buchungen</span>}
                </h4>
                <dl className="diag-meta">
                  <div><dt>Dokument-ID</dt><dd className="diag-mono">{project.id}</dd></div>
                  <div><dt>Kunde (client)</dt><dd>{project.client || '—'}</dd></div>
                  <div>
                    <dt>customerId</dt>
                    <dd className="diag-mono">
                      {project.customerId || '—'} {project.customerName ? `„${project.customerName}"` : ''}
                    </dd>
                  </div>
                  <div><dt>Status</dt><dd>{project.status || '—'} / isActive={String(project.isActive)}</dd></div>
                  <div><dt>heroProjectId</dt><dd className="diag-mono">{project.heroProjectId || '—'}</dd></div>
                  <div><dt>Stempelsätze</dt><dd>{project.entryCount}</dd></div>
                  <div><dt>Stunden</dt><dd>{project.totalHours.toFixed(2)}</dd></div>
                  <div><dt>Material an Sätzen</dt><dd>{project.materialPositions}</dd></div>
                  <div><dt>Material-Buchungen</dt><dd>{project.materialCreditCount}</dd></div>
                </dl>
                {renderEntryTable(
                  project.entries,
                  'Auf diesem Projektdokument liegt kein einziger Stempelsatz – genau deshalb bleibt die Nachkalkulation leer.'
                )}
                {project.entryCount > 0 &&
                  renderMovePanel({
                    type: 'project',
                    id: project.id,
                    label: project.name,
                    entryCount: project.entryCount,
                    totalHours: project.totalHours,
                    materialPositions: project.materialPositions
                  })}
              </div>
            ))}
          </section>

          <section className="diag-section">
            <h3>Passende Kunden – Kleinaufträge ({result.matchedCustomers.length})</h3>
            {result.matchedCustomers.length === 0 && (
              <p className="diag-empty">Kein Kundendokument enthält „{result.search}".</p>
            )}
            {result.matchedCustomers.map((customer) => (
              <div key={customer.id} className="diag-card">
                <h4>
                  {customer.name}
                  {customer.entryCount > 0 && (
                    <span className="diag-flag diag-flag-warn">
                      {customer.entryCount} Kleinauftrags-Buchungen
                    </span>
                  )}
                </h4>
                <dl className="diag-meta">
                  <div><dt>Dokument-ID</dt><dd className="diag-mono">{customer.id}</dd></div>
                  <div><dt>Stunden</dt><dd>{customer.totalHours.toFixed(2)}</dd></div>
                  <div><dt>Material</dt><dd>{customer.materialPositions}</dd></div>
                </dl>
                {renderEntryTable(
                  customer.entries,
                  'Keine Kleinauftrags-Buchungen auf diesem Kunden.'
                )}
                {customer.entryCount > 0 &&
                  renderMovePanel({
                    type: 'customer',
                    id: customer.id,
                    label: customer.name,
                    entryCount: customer.entryCount,
                    totalHours: customer.totalHours,
                    materialPositions: customer.materialPositions
                  })}
              </div>
            ))}
          </section>

          <section className="diag-section">
            <h3>Stempelsätze ohne Projekt und ohne Kunde ({result.entriesWithoutProject.length})</h3>
            {renderEntryTable(result.entriesWithoutProject, 'Keine solchen Sätze vorhanden.')}
          </section>

          <section className="diag-section">
            <h3>Projekt-IDs ohne Projektdokument ({result.danglingGroups.length})</h3>
            {result.danglingGroups.length === 0 ? (
              <p className="diag-empty">Alle Stempelsätze zeigen auf vorhandene Projekte.</p>
            ) : (
              result.danglingGroups.map((group) => (
                <div key={group.projectId} className="diag-card">
                  <h4 className="diag-mono">{group.projectId}</h4>
                  <p>
                    {group.entryCount} Stempelsätze · {group.totalHours.toFixed(2)} Std ·{' '}
                    {group.firstDateLabel} bis {group.lastDateLabel} · {group.employees.join(', ')}
                  </p>
                  {renderEntryTable(group.entries, '')}
                </div>
              ))
            )}
          </section>

          <section className="diag-section">
            <h3>Text-Treffer außerhalb der gefundenen Projekte ({result.textMatchesElsewhere.length})</h3>
            {renderEntryTable(
              result.textMatchesElsewhere,
              'Keine Stempelsätze mit passendem Text an anderer Stelle.'
            )}
          </section>

          <section className="diag-section">
            <h3>Textbericht zum Weitergeben</h3>
            <div className="diag-report-actions">
              <button type="button" className="btn primary-btn" onClick={handleCopy}>
                Bericht kopieren
              </button>
              <button type="button" className="btn secondary-btn" onClick={handleDownload}>
                Als .txt herunterladen
              </button>
            </div>
            <textarea
              className="diag-report"
              value={reportText}
              readOnly
              rows={22}
              onFocus={(e) => e.currentTarget.select()}
            />
          </section>
        </>
      )}
    </div>
  )
}

export default DiagnosticsTab
