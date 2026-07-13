import React from 'react'
import { formatClockInLocationLabel, getClockInCoordinates } from '../../../utils/geoDisplay'
import { HERO_INTEGRATION_UI_ENABLED } from '../../../constants/heroIntegration'
import type { DashboardContext, WidgetDef } from './types'

/** Kleine Kennzahl (große Zahl + optionaler Verweis). Bewusst ohne Icon – clean. */
const StatTile: React.FC<{
  value: React.ReactNode
  caption?: string
  onClick?: () => void
}> = ({ value, caption, onClick }) => {
  const content = (
    <>
      <span className="dw-stat-value">{value}</span>
      {caption && <span className="dw-stat-cta">{caption}</span>}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className="dw-stat dw-stat-clickable" onClick={onClick}>
        {content}
      </button>
    )
  }
  return <div className="dw-stat">{content}</div>
}

/** Live-Aktivitäten (eingestempelte Mitarbeiter) inkl. Admin-Ausstempeln. */
const LiveActivityWidget: React.FC<{ ctx: DashboardContext }> = ({ ctx }) => {
  const { liveActivities, nowTick, clockingOutId, onAdminClockOut } = ctx.data
  if (liveActivities.length === 0) {
    return <p className="dw-empty">Aktuell ist niemand eingestempelt.</p>
  }
  return (
    <div className="dw-activity-list">
      {liveActivities.map((activity) => {
        const clockInTime =
          activity.timeEntry.clockInTime instanceof Date
            ? activity.timeEntry.clockInTime
            : (activity.timeEntry.clockInTime as any)?.toDate?.() ||
              new Date(activity.timeEntry.clockInTime as any)
        const durationMs = nowTick - clockInTime.getTime()
        const h = Math.floor(durationMs / 3_600_000)
        const m = Math.floor((durationMs % 3_600_000) / 60_000)
        const duration = h > 0 ? `${h}h ${m}min` : `${m}min`
        const timeString = clockInTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        const employeeName =
          activity.employee.name ||
          `${activity.employee.firstName || ''} ${activity.employee.lastName || ''}`.trim()
        const isClockingOut = clockingOutId === activity.timeEntry.id
        const locationLabel = formatClockInLocationLabel(activity.timeEntry)
        const coords = getClockInCoordinates(activity.timeEntry)
        const mapsHref = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : null

        return (
          <div key={activity.timeEntry.id} className="dw-activity-item">
            <div className="dw-activity-info">
              <strong>{employeeName}</strong>
              <span className="dw-activity-project">{activity.project.name}</span>
              <span className="dw-activity-meta">
                seit {timeString} · {duration}
              </span>
              {locationLabel && mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="dw-activity-loc">
                  {locationLabel}
                </a>
              )}
            </div>
            <button
              type="button"
              className="btn clock-out-btn"
              disabled={isClockingOut}
              onClick={() => onAdminClockOut(activity.timeEntry, employeeName)}
            >
              {isClockingOut ? '…' : 'Ausstempeln'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Der „Pool" aller Funktionen. Jede Funktion der App ist hier genau einmal als
 * Widget registriert – Launcher (öffnet Tab/Modal) oder Insight (Live-Daten).
 */
const ALL_WIDGETS: WidgetDef[] = [
  // --- Kennzahlen (Insight) ---
  {
    key: 'stat-clockedin',
    title: 'Eingestempelte Mitarbeiter',
    description: 'Anzahl aktuell eingestempelter Mitarbeiter.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'small',
    render: (ctx) => <StatTile value={ctx.data.clockedInCount} />
  },
  {
    key: 'stat-active-projects',
    title: 'Aktive Projekte',
    description: 'Anzahl aktiver Projekte – öffnet die Projektliste.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'small',
    render: (ctx) => (
      <StatTile value={ctx.data.activeProjectsCount} caption="Projekte" onClick={() => ctx.navigate('projects')} />
    )
  },
  {
    key: 'stat-total-employees',
    title: 'Mitarbeiter gesamt',
    description: 'Anzahl aller Mitarbeiter – öffnet die Mitarbeiterliste.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'small',
    render: (ctx) => (
      <StatTile value={ctx.data.totalEmployees} caption="Mitarbeiter" onClick={() => ctx.navigate('employees')} />
    )
  },
  {
    key: 'stat-today-hours',
    title: 'Heutige Arbeitsstunden',
    description: 'Summe der heute erfassten Stunden – öffnet den Tagesbericht.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'small',
    render: (ctx) => (
      <StatTile value={`${ctx.data.todayHours} h`} caption="Tagesbericht" onClick={() => ctx.openModal('dailyReport')} />
    )
  },
  {
    key: 'stat-open-vacation',
    title: 'Offene Urlaubsanträge',
    description: 'Anzahl ausstehender Urlaubsanträge – öffnet die Urlaubsverwaltung.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'small',
    render: (ctx) => (
      <StatTile value={ctx.data.openVacationCount} caption="Urlaub" onClick={() => ctx.navigate('vacation')} />
    )
  },
  {
    key: 'live-activity',
    title: 'Live-Aktivitäten',
    description: 'Wer ist gerade eingestempelt – mit direktem Ausstempeln.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'large',
    render: (ctx) => <LiveActivityWidget ctx={ctx} />
  },

  // --- Stammdaten (Launcher) ---
  {
    key: 'new-employee',
    title: 'Neuer Mitarbeiter',
    description: 'Mitarbeiter anlegen.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'employee' }
  },
  {
    key: 'employees',
    title: 'Mitarbeiterliste',
    description: 'Alle Mitarbeiter verwalten.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'employees' }
  },
  {
    key: 'new-customer',
    title: 'Neuer Kunde',
    description: 'Kunde anlegen.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'customer' }
  },
  {
    key: 'customers',
    title: 'Kunden',
    description: 'Kundenliste verwalten.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'customers' }
  },
  {
    key: 'new-material',
    title: 'Neue Materialart',
    description: 'Materialart mit Preisen anlegen.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'material' }
  },
  {
    key: 'material',
    title: 'Material',
    description: 'Materialkatalog verwalten.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'material' }
  },
  {
    key: 'new-vehicle',
    title: 'Neues Fahrzeug',
    description: 'Fahrzeug anlegen.',
    category: 'Stammdaten',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'vehicle' }
  },

  // --- Projekte (Launcher) ---
  {
    key: 'new-project',
    title: 'Neues Projekt',
    description: 'Projekt anlegen.',
    category: 'Projekte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'project' }
  },
  {
    key: 'projects',
    title: 'Projekte',
    description: 'Aktive Projekte verwalten.',
    category: 'Projekte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'projects' }
  },
  {
    key: 'projects-archived',
    title: 'Archivierte Projekte',
    description: 'Abgeschlossene/archivierte Projekte ansehen.',
    category: 'Projekte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'projectsArchived' }
  },

  // --- Berichte (Launcher) ---
  {
    key: 'daily-report',
    title: 'Tagesbericht',
    description: 'Heutige Stempelungen, Stunden und Material.',
    category: 'Berichte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'dailyReport' }
  },
  {
    key: 'reports',
    title: 'Zeiterfassungsbericht',
    description: 'Zeitbericht je Mitarbeiter erstellen und drucken.',
    category: 'Berichte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'reports' }
  },
  {
    key: 'costing',
    title: 'Nachkalkulation',
    description: 'Personal- und Materialkosten je Projekt auswerten.',
    category: 'Berichte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'costing' }
  },
  {
    key: 'vacation',
    title: 'Urlaubsverwaltung',
    description: 'Urlaubsanträge prüfen und verwalten.',
    category: 'Berichte',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'vacation' }
  },

  // --- System (Launcher) ---
  {
    key: 'notifications',
    title: 'Benachrichtigungen',
    description: 'Push-Einstellungen für dieses Admin-Gerät.',
    category: 'System',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'tab', tab: 'notifications' }
  },
  ...(HERO_INTEGRATION_UI_ENABLED
    ? [
        {
          key: 'hero',
          title: 'HERO-Integration',
          description: 'HERO-Synchronisation und Diagnose.',
          category: 'System',
          kind: 'launcher',
          defaultSize: 'small',
          action: { type: 'tab', tab: 'hero' }
        } as WidgetDef
      ]
    : [])
]

/** Widget-Pool (nach Sichtbarkeit gefiltert). */
export const WIDGET_REGISTRY: WidgetDef[] = ALL_WIDGETS

const WIDGET_BY_KEY = new Map(WIDGET_REGISTRY.map((w) => [w.key, w]))

export const getWidgetDef = (key: string): WidgetDef | undefined => WIDGET_BY_KEY.get(key)

/** Standard-Anordnung für Admins, die noch kein eigenes Dashboard gespeichert haben. */
export const DEFAULT_WIDGET_KEYS: string[] = [
  'stat-clockedin',
  'stat-active-projects',
  'stat-today-hours',
  'stat-open-vacation',
  'live-activity'
]
