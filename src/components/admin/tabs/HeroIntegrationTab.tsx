import { useCallback, useEffect, useState } from 'react'
import { DataService } from '../../../services/dataService'
import { heroService, type HeroHealthResponse } from '../../../services/heroService'
import type { Employee, HeroIntegrationConfig, HeroSyncLogEntry } from '../../../types'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'

const HeroIntegrationTab: React.FC = () => {
  const [health, setHealth] = useState<HeroHealthResponse | null>(null)
  const [config, setConfig] = useState<HeroIntegrationConfig | null>(null)
  const [logs, setLogs] = useState<HeroSyncLogEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [heroIdDrafts, setHeroIdDrafts] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)
  const [isSyncingProjects, setIsSyncingProjects] = useState(false)
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [integrationConfig, syncLogs, allEmployees] = await Promise.all([
        heroService.getIntegrationConfig(),
        heroService.getRecentSyncLogs(8),
        DataService.getAllEmployees()
      ])
      setConfig(integrationConfig)
      setLogs(syncLogs)
      setEmployees(allEmployees.filter((e) => !e.isAdmin))
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
                    <td>{employee.name || employee.username}</td>
                    <td>
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
                    <td>
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
