import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { authReady } from './shared'
import type { DashboardWidgetInstance } from '../../types'

// Kontoweite Speicherung der individuellen Admin-Dashboard-Anordnung.
// Ein Dokument je Admin (Schlüssel = Admin-ID bzw. Benutzername).
const COLLECTION = 'adminDashboards'

const sanitizeKey = (key: string): string => (key || 'admin').replace(/[/\s]+/g, '-')

/** Lädt die gespeicherte Widget-Anordnung eines Admins (null, wenn noch keine existiert). */
export async function loadAdminDashboard(
  adminKey: string
): Promise<DashboardWidgetInstance[] | null> {
  await authReady
  try {
    const snap = await getDoc(doc(db, COLLECTION, sanitizeKey(adminKey)))
    if (!snap.exists()) return null
    const data = snap.data() as { widgets?: DashboardWidgetInstance[] }
    return Array.isArray(data.widgets) ? data.widgets : null
  } catch (error) {
    console.error('Dashboard-Anordnung konnte nicht geladen werden:', error)
    return null
  }
}

/** Speichert die Widget-Anordnung eines Admins (überschreibt das ganze Layout). */
export async function saveAdminDashboard(
  adminKey: string,
  widgets: DashboardWidgetInstance[]
): Promise<void> {
  await authReady
  try {
    await setDoc(doc(db, COLLECTION, sanitizeKey(adminKey)), {
      widgets,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Dashboard-Anordnung konnte nicht gespeichert werden:', error)
    throw error
  }
}
