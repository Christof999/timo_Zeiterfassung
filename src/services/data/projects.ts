import { addDoc, collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Project } from '../../types'
import { authReady } from './shared'
import { OVERHEAD_PROJECT_DEFS, overheadKindOf } from '../../constants/overheadProjects'

/**
 * Legt die fehlenden Gemeinkosten-Projekte (Nachbesserung, Lager) an und
 * liefert die neu erzeugten zurück.
 *
 * `known` ist die vollständige, gerade gelesene Projektliste – so braucht das
 * Anlegen keine zusätzliche Abfrage. Dank fester Dokument-IDs ist der Vorgang
 * idempotent; ein bewusst archiviertes Gemeinkosten-Projekt taucht in `known`
 * weiter auf und wird deshalb nicht wieder aktiviert.
 */
export async function ensureOverheadProjects(known: Project[]): Promise<Project[]> {
  const missing = OVERHEAD_PROJECT_DEFS.filter(
    (def) => !known.some((project) => overheadKindOf(project) === def.kind)
  )
  if (missing.length === 0) return []

  const created: Project[] = []
  for (const def of missing) {
    const project: Project = {
      id: def.id,
      name: def.name,
      description: def.description,
      overheadKind: def.kind,
      status: 'active',
      isActive: true
    }
    try {
      const { id, ...payload } = project
      await setDoc(doc(db, 'projects', id), payload)
      created.push(project)
    } catch (error) {
      console.error(`Gemeinkosten-Projekt „${def.name}" konnte nicht angelegt werden:`, error)
    }
  }
  return created
}

/**
 * Einmal je Sitzung: fehlende Gemeinkosten-Projekte anlegen. Schlägt das
 * Anlegen fehl (z. B. offline), wird beim nächsten Projekt-Laden erneut
 * versucht, statt die Lücke bis zum Neustart mitzuschleppen.
 */
let overheadSeedPromise: Promise<Project[]> | null = null

async function seedOverheadProjects(known: Project[]): Promise<Project[]> {
  if (!overheadSeedPromise) {
    overheadSeedPromise = ensureOverheadProjects(known).then((created) => {
      const complete = OVERHEAD_PROJECT_DEFS.every((def) =>
        [...known, ...created].some((project) => overheadKindOf(project) === def.kind)
      )
      if (!complete) overheadSeedPromise = null
      return created
    })
  }
  return overheadSeedPromise
}

export async function getActiveProjects(): Promise<Project[]> {
  await authReady
  try {
    const projectsRef = collection(db, 'projects')
    const snapshot = await getDocs(projectsRef)
    const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))
    let projects = [...all, ...(await seedOverheadProjects(all))]

    projects = projects.filter((project) => {
      const isActiveFlag = project.isActive !== false
      const normalizedStatus = (project.status || '').toLowerCase()
      const isActiveStatus = !project.status || normalizedStatus === 'active' || normalizedStatus === 'aktiv'
      return isActiveFlag && isActiveStatus
    })

    projects.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return projects
  } catch (error) {
    console.error('Fehler beim Abrufen aktiver Projekte:', error)
    return []
  }
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  await authReady
  if (!projectId) {
    return null
  }

  try {
    const projectRef = doc(db, 'projects', projectId)
    const projectDoc = await getDoc(projectRef)

    if (projectDoc.exists()) {
      return { id: projectDoc.id, ...projectDoc.data() } as Project
    }
    return null
  } catch (error) {
    console.error(`Fehler beim Abrufen des Projekts ${projectId}:`, error)
    return null
  }
}

export async function getAllProjects(): Promise<Project[]> {
  await authReady
  try {
    const projectsRef = collection(db, 'projects')
    const snapshot = await getDocs(projectsRef)
    const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))
    return [...all, ...(await seedOverheadProjects(all))]
  } catch (error) {
    console.error('Fehler beim Abrufen aller Projekte:', error)
    return []
  }
}

export async function createProject(projectData: Partial<Project>): Promise<string> {
  await authReady
  try {
    const projectsRef = collection(db, 'projects')
    const raw = {
      ...projectData,
      isActive: projectData.isActive !== false,
      status: projectData.status || 'active'
    }
    // Firestore verwirft Schreibvorgänge mit undefined-Feldern — optionale Daten weglassen
    const payload = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== undefined)
    )
    const docRef = await addDoc(projectsRef, payload)
    return docRef.id
  } catch (error) {
    console.error('Fehler beim Erstellen des Projekts:', error)
    throw error
  }
}

export async function updateProject(
  id: string,
  projectData: Partial<Project> & Record<string, unknown>
): Promise<void> {
  await authReady
  try {
    if (!id) {
      throw new Error('Keine gültige Projekt-ID angegeben')
    }

    const projectRef = doc(db, 'projects', id)
    const payload = Object.fromEntries(
      Object.entries(projectData).filter(([, value]) => value !== undefined)
    )
    await updateDoc(projectRef, payload)
  } catch (error) {
    console.error(`Fehler beim Aktualisieren des Projekts ${id}:`, error)
    throw error
  }
}

/** „Löschen" archiviert das Projekt nur (Zeiteinträge bleiben zuordenbar). */
export async function deleteProject(id: string): Promise<void> {
  await authReady
  try {
    const projectRef = doc(db, 'projects', id)
    await updateDoc(projectRef, {
      status: 'archived',
      isActive: false
    })
  } catch (error) {
    console.error(`Fehler beim Löschen des Projekts ${id}:`, error)
    throw error
  }
}
