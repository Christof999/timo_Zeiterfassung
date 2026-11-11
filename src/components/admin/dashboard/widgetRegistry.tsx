import React from 'react'
import LiveBoard from './LiveBoard'
import type { WidgetDef } from './types'

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
    description: 'Wer ist gerade wo eingestempelt – Liste, Karte und Tagesblatt je Mitarbeiter.',
    category: 'Kennzahlen',
    kind: 'insight',
    defaultSize: 'large',
    render: (ctx) => <LiveBoard ctx={ctx} />
  },
  {
    key: 'admin-clock-in',
    title: 'Mitarbeiter einstempeln',
    description: 'Einen Mitarbeiter direkt auf ein Projekt oder einen Kunden einstempeln.',
    category: 'Kennzahlen',
    kind: 'launcher',
    defaultSize: 'small',
    action: { type: 'modal', modal: 'adminClockIn' }
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
    key: 'customers',
    title: 'Kunden',
    description: 'Kundenstamm aus dem Rechnungsprogramm ansehen.',
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
  'admin-clock-in',
  'live-activity'
]
