import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Project } from '../../types'
import { authReady } from './shared'

export async function getActiveProjects(): Promise<Project[]> {
  await authReady
  try {
    const projectsRef = collection(db, 'projects')
    const snapshot = await getDocs(projectsRef)
    let projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))

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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))
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
