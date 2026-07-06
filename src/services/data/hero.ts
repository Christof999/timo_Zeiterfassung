import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { HeroIntegrationConfig, HeroSyncLogEntry } from '../../types'
import { authReady, convertToDate } from './shared'

export async function getHeroIntegrationConfig(): Promise<HeroIntegrationConfig | null> {
  await authReady
  try {
    const configRef = doc(db, 'integrations', 'hero')
    const snap = await getDoc(configRef)
    if (!snap.exists()) return null
    return snap.data() as HeroIntegrationConfig
  } catch (error) {
    console.error('Fehler beim Laden der HERO-Integration:', error)
    return null
  }
}

export async function getHeroSyncLogs(limit = 10): Promise<HeroSyncLogEntry[]> {
  await authReady
  try {
    const logsRef = collection(db, 'heroSyncLogs')
    const snapshot = await getDocs(logsRef)
    const logs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as HeroSyncLogEntry[]

    logs.sort((a, b) => {
      const aTime = convertToDate(a.createdAt)?.getTime() ?? 0
      const bTime = convertToDate(b.createdAt)?.getTime() ?? 0
      return bTime - aTime
    })

    return logs.slice(0, limit)
  } catch (error) {
    console.error('Fehler beim Laden der HERO-Sync-Logs:', error)
    return []
  }
}
