import type { Project } from '../types'

/** Projekte mit Status abgeschlossen, archiviert oder inaktiv (inkl. ältere Daten ohne Status, aber isActive false). */
export function isProjectArchivedOrCompleted(project: Project): boolean {
  const s = String(project.status ?? '')
    .toLowerCase()
    .trim()
  if (s === 'archived' || s === 'completed' || s === 'inactive') return true
  if (!s && project.isActive === false) return true
  return false
}
