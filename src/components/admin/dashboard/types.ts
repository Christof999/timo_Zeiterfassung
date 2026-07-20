import type { ReactNode } from 'react'
import type { Employee, Project, TimeEntry, DashboardWidgetSize } from '../../../types'

/** Tabs, in die eine Launcher-Kachel springen kann. */
export type DashboardTabKey =
  | 'overview'
  | 'notifications'
  | 'employees'
  | 'projects'
  | 'projectsArchived'
  | 'customers'
  | 'material'
  | 'costing'
  | 'hero'
  | 'vacation'
  | 'reports'

/** Modals, die eine Launcher-Kachel direkt öffnen kann. */
export type DashboardModalKey =
  | 'employee'
  | 'project'
  | 'customer'
  | 'material'
  | 'vehicle'
  | 'dailyReport'
  | 'adminClockIn'

export interface LiveActivity {
  /** Kann fehlen, wenn der Mitarbeiter (z. B. gelöscht) nicht mehr auflösbar ist. */
  employee?: Employee
  /** Kann fehlen, wenn das Projekt (z. B. gelöscht/archiviert) nicht mehr auflösbar ist. */
  project?: Project
  timeEntry: TimeEntry
}

/** Alle Live-Daten, die Insight-Widgets brauchen (einmal im Dashboard geladen). */
export interface DashboardData {
  clockedInCount: number
  activeProjectsCount: number
  totalEmployees: number
  todayHours: string
  openVacationCount: number
  liveActivities: LiveActivity[]
  /** Tick (ms) für laufende Daueranzeigen ohne neue Firestore-Reads. */
  nowTick: number
  /** Aktuell laufender Admin-Ausstempel-Vorgang (TimeEntry-ID) oder null. */
  clockingOutId: string | null
  onAdminClockOut: (entry: TimeEntry, employeeName: string) => void
}

/** Kontext, den Widgets zum Rendern/Handeln erhalten. */
export interface DashboardContext {
  data: DashboardData
  navigate: (tab: DashboardTabKey) => void
  openModal: (modal: DashboardModalKey) => void
}

export type WidgetCategory = 'Kennzahlen' | 'Stammdaten' | 'Projekte' | 'Berichte' | 'System'
export type WidgetKind = 'launcher' | 'insight'

/** Eine Funktion aus dem „Pool" – einmal registriert, überall im Dashboard nutzbar. */
export interface WidgetDef {
  key: string
  title: string
  description: string
  category: WidgetCategory
  kind: WidgetKind
  defaultSize: DashboardWidgetSize
  /** Launcher: was beim Klick passiert. */
  action?: { type: 'tab'; tab: DashboardTabKey } | { type: 'modal'; modal: DashboardModalKey }
  /** Insight: Live-Inhalt der Kachel. */
  render?: (ctx: DashboardContext) => ReactNode
}
