import type { OverheadProjectKind, Project } from '../types'

/**
 * Die beiden festen Gemeinkosten-Projekte der Zeiterfassung.
 *
 * Auf sie wird gestempelt, wenn es keinen Ertrag gibt: eine Nachbesserung auf
 * einer bereits abgeschlossenen Baustelle oder Arbeiten im eigenen Lager. Die
 * Stunden sind vom Betrieb bezahlte Kosten – sie gehen in der Nachkalkulation
 * mit dem Lohnkostensatz gegen den Ertrag, bekommen aber keine Verrechnung.
 *
 * Die Dokument-IDs sind bewusst fest: so kann das Anlegen beliebig oft laufen,
 * ohne Duplikate zu erzeugen (auch wenn zwei Geräte gleichzeitig starten).
 */
export interface OverheadProjectDef {
  kind: OverheadProjectKind
  /** Feste Firestore-Dokument-ID in `projects` */
  id: string
  name: string
  description: string
}

export const OVERHEAD_PROJECT_DEFS: OverheadProjectDef[] = [
  {
    kind: 'rework',
    id: 'overhead-nachbesserung',
    name: 'Nachbesserung',
    description:
      'Gemeinkosten-Projekt: Nachbesserungen auf bereits abgeschlossenen Baustellen. ' +
      'Die Stunden werden vom Betrieb bezahlt und bringen keinen Ertrag.'
  },
  {
    kind: 'warehouse',
    id: 'overhead-lager',
    name: 'Lager',
    description:
      'Gemeinkosten-Projekt: Arbeiten im eigenen Lager (aufräumen, sortieren, Wartung). ' +
      'Die Stunden werden vom Betrieb bezahlt und bringen keinen Ertrag.'
  }
]

export const OVERHEAD_PROJECT_LABELS: Record<OverheadProjectKind, string> = {
  rework: 'Nachbesserung',
  warehouse: 'Lager'
}

/**
 * Art des Gemeinkosten-Projekts – oder `null` für ein normales Baustellen-/
 * Kundenprojekt.
 *
 * Neben dem Feld `overheadKind` greift bewusst auch der Name: Betriebe, die
 * „Nachbesserung"/„Lager" schon vor diesem Feature manuell als Projekt angelegt
 * haben, sollen ohne Umbuchen in der Auswertung landen. HERO-Projekte sind
 * ausgenommen – dort entscheidet allein der Sync über die Bedeutung.
 */
export function overheadKindOf(project: Pick<Project, 'overheadKind' | 'name' | 'heroProjectId'>): OverheadProjectKind | null {
  if (project.overheadKind === 'rework' || project.overheadKind === 'warehouse') {
    return project.overheadKind
  }
  if (project.heroProjectId) return null
  const name = (project.name || '').trim().toLowerCase()
  if (!name) return null
  const def = OVERHEAD_PROJECT_DEFS.find((d) => d.name.toLowerCase() === name)
  return def ? def.kind : null
}

/** True für die Gemeinkosten-Projekte (Nachbesserung, Lager). */
export const isOverheadProject = (
  project: Pick<Project, 'overheadKind' | 'name' | 'heroProjectId'>
): boolean => overheadKindOf(project) !== null
