import { useCallback, useEffect, useState } from 'react'
import { DataService } from '../../../services/dataService'
import {
  heroService,
  type HeroHealthResponse,
  type HeroDiagnosticsResponse
} from '../../../services/heroService'
import type { Employee, HeroIntegrationConfig, HeroSyncLogEntry, Project } from '../../../types'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'

const HeroIntegrationTab: React.FC = () => {
  const [health, setHealth] = useState<HeroHealthResponse | null>(null)
  const [diagnostics, setDiagnostics] = useState<HeroDiagnosticsResponse | null>(null)
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false)
  const [config, setConfig] = useState<HeroIntegrationConfig | null>(null)
  const [logs, setLogs] = useState<HeroSyncLogEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [heroIdDrafts, setHeroIdDrafts] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)
  const [isSyncingProjects, setIsSyncingProjects] = useState(false)
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null)
  const [heroProjects, setHeroProjects] = useState<Project[]>([])
  const [probeProjectId, setProbeProjectId] = useState('')
  const [isProbing, setIsProbing] = useState(false)
  const [probeResult, setProbeResult] = useState<any>(null)

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [integrationConfig, syncLogs, allEmployees, allProjects] = await Promise.all([
        heroService.getIntegrationConfig(),
        heroService.getRecentSyncLogs(8),
        DataService.getAllEmployees(),
        DataService.getAllProjects().catch(() => [] as Project[])
      ])
      setConfig(integrationConfig)
      setLogs(syncLogs)
      setEmployees(allEmployees.filter((e) => !e.isAdmin))
      setHeroProjects(
        allProjects
          .filter((p) => p.heroProjectId)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
      )
      const drafts: Record<string, string> = {}
      allEmployees.forEach((e) => {
        if (e.id) drafts[e.id] = e.heroEmployeeId || ''
      })
      setHeroIdDrafts(drafts)
    } catch (error: any) {
      toast.error(error?.message || 'HERO-Daten konnten nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleProbeOffer = async () => {
    const project = heroProjects.find((p) => p.heroProjectId === probeProjectId)
    if (!project?.heroProjectId) {
      toast.error('Bitte ein HERO-Projekt auswählen')
      return
    }
    setIsProbing(true)
    setProbeResult(null)
    try {
      const result = await heroService.probeOffer(project.heroProjectId)
      setProbeResult(result.probe ?? { info: 'Keine Daten' })
      toast.success(
        `Angebots-Probe: ${result.probe?.documentCount ?? 0} Dokument(e) gefunden.`
      )
    } catch (error: any) {
      toast.error('Angebots-Probe fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsProbing(false)
    }
  }

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true)
    try {
      const result = await heroService.checkHealth()
      setHealth(result)
      if (result.apiReachable) {
        toast.success('HERO API erreichbar')
      } else {
        toast.error(result.apiError || 'HERO API nicht erreichbar')
      }
    } catch (error: any) {
      toast.error(error?.message || 'Verbindungstest fehlgeschlagen')
    } finally {
      setIsCheckingHealth(false)
    }
  }

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true)
    try {
      const result = await heroService.runDiagnostics()
      setDiagnostics(result)
      if (result.reachable) {
        toast.success(`HERO erreichbar – ${result.projects?.count ?? 0} Projekt(e) gelesen`)
      } else {
        toast.error(result.error || 'HERO nicht erreichbar')
      }
    } catch (error: any) {
      toast.error(error?.message || 'Feld-Diagnose fehlgeschlagen')
    } finally {
      setIsRunningDiagnostics(false)
    }
  }

  const handleCopyDiagnostics = async () => {
    if (!diagnostics) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2))
      toast.success('Diagnose in die Zwischenablage kopiert')
    } catch {
      toast.error('Kopieren nicht möglich – bitte Text manuell markieren')
    }
  }

  const handleSyncProjects = async () => {
    setIsSyncingProjects(true)
    try {
      const result = await heroService.syncProjects()
      const stats = result.stats
      toast.success(
        stats
          ? `Sync: ${stats.created} neu, ${stats.updated} aktualisiert (${stats.total} aus HERO)`
          : 'Projekt-Sync abgeschlossen'
      )
      await loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Projekt-Sync fehlgeschlagen')
      await loadAll()
    } finally {
      setIsSyncingProjects(false)
    }
  }

  const handleSaveHeroEmployeeId = async (employeeId: string) => {
    setSavingEmployeeId(employeeId)
    try {
      const heroEmployeeId = (heroIdDrafts[employeeId] || '').trim()
      await DataService.updateEmployee(employeeId, {
        heroEmployeeId: heroEmployeeId || ''
      })
      toast.success('HERO-Zuordnung gespeichert')
      await loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Speichern fehlgeschlagen')
    } finally {
      setSavingEmployeeId(null)
    }
  }

  const formatDate = (value: unknown) => {
    if (!value) return '–'
    const d =
      value instanceof Date
        ? value
        : typeof (value as { toDate?: () => Date })?.toDate === 'function'
          ? (value as { toDate: () => Date }).toDate()
          : new Date(value as string | number)
    if (Number.isNaN(d.getTime())) return '–'
    return d.toLocaleString('de-DE')
  }

  if (isLoading) {
    return <div className="loading">Lade HERO-Integration…</div>
  }

  return (
    <div className="hero-integration-tab">
      <div className="tab-header">
        <h3>HERO-Integration</h3>
      </div>

      <p className="tab-hint">
        Phase 1: Projekt-Import aus HERO und Vorbereitung für den Zeit-Export. Der Export erfasster
        Stunden an HERO folgt, sobald HERO die passende API-Mutation bestätigt hat.
      </p>

      <section className="hero-card">
        <h4>Verbindung</h4>
        <div className="hero-actions">
          <button
            type="button"
            className="btn secondary-btn"
            disabled={isCheckingHealth}
            onClick={handleHealthCheck}
          >
            {isCheckingHealth ? 'Prüfe…' : 'Verbindung testen'}
          </button>
          <button
            type="button"
            className="btn secondary-btn"
            disabled={isRunningDiagnostics}
            onClick={handleRunDiagnostics}
          >
            {isRunningDiagnostics ? 'Teste Felder…' : 'HERO-Felder testen'}
          </button>
          <button
            type="button"
            className="btn primary-btn"
            disabled={isSyncingProjects}
            onClick={handleSyncProjects}
          >
            {isSyncingProjects ? 'Synchronisiere…' : 'Projekte von HERO synchronisieren'}
          </button>
        </div>

        {health && (
          <ul className="hero-status-list">
            <li>
              Sync aktiviert: <strong>{health.syncEnabled ? 'ja' : 'nein'}</strong> (Server:
              HERO_SYNC_ENABLED)
            </li>
            <li>
              API-Key hinterlegt: <strong>{health.hasApiKey ? 'ja' : 'nein'}</strong>
            </li>
            <li>
              API erreichbar: <strong>{health.apiReachable ? 'ja' : 'nein'}</strong>
              {health.apiError ? ` – ${health.apiError}` : ''}
            </li>
          </ul>
        )}

        {!health && (
          <p className="tab-hint">Tipp: „Verbindung testen“ prüft Key und HERO GraphQL auf dem Server.</p>
        )}
      </section>

      <section className="hero-card">
        <h4>Angebots-Probe (Struktur-Analyse)</h4>
        <p className="tab-hint">
          Liest EIN echtes Angebot/Dokument eines Projekts aus HERO, um den Aufbau der Positionen
          (Typen, Mengen im JSON-Entwurf) zu prüfen. Grundlage für den geplanten Angebots-Import.
        </p>
        <div className="hero-actions">
          <select
            value={probeProjectId}
            onChange={(e) => setProbeProjectId(e.target.value)}
            disabled={isProbing}
          >
            <option value="">— HERO-Projekt wählen —</option>
            {heroProjects.map((p) => (
              <option key={p.id} value={p.heroProjectId}>
                {p.name || p.heroProjectId}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn secondary-btn"
            disabled={isProbing || !probeProjectId}
            onClick={handleProbeOffer}
          >
            {isProbing ? 'Lese Angebot…' : 'Angebot auslesen'}
          </button>
        </div>
        {heroProjects.length === 0 && (
          <p className="tab-hint">Noch keine HERO-Projekte vorhanden – bitte zuerst Projekte synchronisieren.</p>
        )}
        {probeResult && (
          <pre className="hero-diagnostics-json">{JSON.stringify(probeResult, null, 2)}</pre>
        )}
      </section>

      <section className="hero-card">
        <h4>HERO-Felder-Diagnose</h4>
        <p className="tab-hint">
          „HERO-Felder testen“ liest direkt bei HERO, welche Werte für die Zeiterfassungs-Übergabe
          verfügbar sind – ohne Firebase, nur mit dem in Vercel hinterlegten <code>HERO_API_KEY</code>.
          Es werden keine Kundendaten angezeigt, nur die Feldstruktur.
        </p>

        {!diagnostics && (
          <p className="tab-hint">Noch keine Diagnose ausgeführt.</p>
        )}

        {diagnostics && (
          <div className="hero-diagnostics">
            <ul className="hero-status-list">
              <li>
                API-Key hinterlegt: <strong>{diagnostics.hasApiKey ? 'ja' : 'nein'}</strong>
              </li>
              <li>
                HERO erreichbar: <strong>{diagnostics.reachable ? 'ja' : 'nein'}</strong>
                {diagnostics.error ? ` – ${diagnostics.error}` : ''}
              </li>
              <li>
                Projekte gelesen: <strong>{diagnostics.projects?.count ?? 0}</strong>
              </li>
            </ul>

            {!diagnostics.reachable && diagnostics.keyInfo && (
              <div className="hero-keycheck">
                <p>
                  <strong>Key-Format-Prüfung</strong> (Länge {diagnostics.keyInfo.trimmedLength},
                  Vorschau <code>{diagnostics.keyInfo.preview}</code> – mit HERO abgleichen):
                </p>
                <ul className="hero-field-check">
                  <li className={diagnostics.keyInfo.hasSurroundingQuotes ? 'error' : 'ok'}>
                    {diagnostics.keyInfo.hasSurroundingQuotes ? '✗' : '✓'} Anführungszeichen um den Wert
                    {diagnostics.keyInfo.hasSurroundingQuotes ? ' – in Vercel entfernen!' : ' – keine'}
                  </li>
                  <li className={diagnostics.keyInfo.containsInnerWhitespace ? 'error' : 'ok'}>
                    {diagnostics.keyInfo.containsInnerWhitespace ? '✗' : '✓'} Leerzeichen/Umbruch im Key
                    {diagnostics.keyInfo.containsInnerWhitespace ? ' – Key ist umgebrochen/kaputt!' : ' – keine'}
                  </li>
                  <li className={diagnostics.keyInfo.startsWithBearer ? 'error' : 'ok'}>
                    {diagnostics.keyInfo.startsWithBearer ? '✗' : '✓'} Wort „Bearer" steht im Wert
                    {diagnostics.keyInfo.startsWithBearer ? ' – „Bearer " aus dem Wert löschen!' : ' – nein'}
                  </li>
                  <li className={diagnostics.keyInfo.hadSurroundingWhitespace ? 'warn' : 'ok'}>
                    {diagnostics.keyInfo.hadSurroundingWhitespace ? '⚠' : '✓'} Führende/abschließende Leerzeichen
                  </li>
                </ul>
              </div>
            )}

            {diagnostics.authProbe && (
              <div className="hero-authprobe">
                <p>
                  <strong>Auth-Test</strong> (welches Header-Format akzeptiert HERO?):
                </p>
                <ul className="hero-field-check">
                  {diagnostics.authProbe.map((p) => (
                    <li key={p.scheme} className={p.ok ? 'ok' : 'error'}>
                      {p.ok ? '✓' : '✗'} <code>{p.scheme}</code> – HTTP {p.status}
                      {p.error ? ` – ${p.error}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diagnostics.availableQueries.relevant.length > 0 && (
              <>
                <p>
                  <strong>Verfügbare HERO-Abfragen</strong> (relevant für Zeit/Personal/Projekt, von{' '}
                  {diagnostics.availableQueries.total} gesamt):
                </p>
                <p className="hero-query-list">
                  {diagnostics.availableQueries.relevant.map((q) => (
                    <code key={q}>{q}</code>
                  ))}
                </p>
              </>
            )}

            {diagnostics.projects && diagnostics.projects.fieldCheck.length > 0 && (
              <>
                <p>
                  <strong>Pflicht-/Soll-Felder</strong> (fehlende Werte über alle Projekte):
                </p>
                <ul className="hero-field-check">
                  {diagnostics.projects.fieldCheck.map((f) => {
                    const mark = f.missing === 0 ? '✓' : f.severity === 'required' ? '✗' : '⚠'
                    const cls =
                      f.missing === 0 ? 'ok' : f.severity === 'required' ? 'error' : 'warn'
                    return (
                      <li key={f.path} className={cls}>
                        {mark} <code>{f.path}</code> [{f.severity}] – fehlt {f.missing}/{f.total}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            <div className="hero-actions">
              <button type="button" className="btn secondary-btn btn-sm" onClick={handleCopyDiagnostics}>
                Diagnose kopieren
              </button>
            </div>
            <details>
              <summary>Rohdaten (Feldstruktur als JSON)</summary>
              <pre className="hero-json">{JSON.stringify(diagnostics, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>

      <section className="hero-card">
        <h4>Letzter Projekt-Sync</h4>
        <p>Zeitpunkt: {formatDate(config?.lastProjectSyncAt)}</p>
        {config?.lastProjectSyncStats && (
          <p>
            Ergebnis: {config.lastProjectSyncStats.created} neu, {config.lastProjectSyncStats.updated}{' '}
            aktualisiert, {config.lastProjectSyncStats.archived} archiviert (von{' '}
            {config.lastProjectSyncStats.total} aus HERO)
          </p>
        )}
        {config?.lastProjectSyncError && (
          <p className="hero-error">Fehler: {config.lastProjectSyncError}</p>
        )}
      </section>

      <section className="hero-card">
        <h4>Mitarbeiter ↔ HERO</h4>
        <p className="tab-hint">
          Tragen Sie die HERO-Kontakt-ID ein (aus HERO oder der GraphQL-Query <code>contacts</code>).
          Ohne Zuordnung kann später kein Zeit-Export erfolgen.
        </p>
        {employees.length === 0 ? (
          <p className="no-data">Keine Mitarbeiter vorhanden</p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>HERO-ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td data-label="Mitarbeiter">{employee.name || employee.username}</td>
                    <td data-label="HERO-ID">
                      <input
                        type="text"
                        className="inline-edit"
                        placeholder="z. B. 12345"
                        value={heroIdDrafts[employee.id!] ?? ''}
                        onChange={(e) =>
                          setHeroIdDrafts((prev) => ({
                            ...prev,
                            [employee.id!]: e.target.value
                          }))
                        }
                      />
                    </td>
                    <td className="action-buttons" data-label="">
                      <button
                        type="button"
                        className="btn secondary-btn btn-sm"
                        disabled={savingEmployeeId === employee.id}
                        onClick={() => employee.id && handleSaveHeroEmployeeId(employee.id)}
                      >
                        {savingEmployeeId === employee.id ? '…' : 'Speichern'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hero-card">
        <h4>Sync-Protokoll</h4>
        {logs.length === 0 ? (
          <p className="no-data">Noch keine Einträge</p>
        ) : (
          <ul className="hero-log-list">
            {logs.map((log) => (
              <li key={log.id} className={log.success ? 'success' : 'error'}>
                <span>{formatDate(log.createdAt)}</span> – [{log.type}]{' '}
                {log.message || log.error || (log.success ? 'OK' : 'Fehler')}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default HeroIntegrationTab
