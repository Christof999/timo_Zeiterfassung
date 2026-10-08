import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebaseConfig'
import { authReady } from './data/shared'

/**
 * Kfz-Pauschale je Anfahrt auf eine Baustelle.
 *
 * Ein fester Betrag für alle Baustellen. Er liegt in Firestore und nicht im
 * Browser, weil das Rechnungsprogramm denselben Wert liest – beide Programme
 * müssen mit derselben Pauschale rechnen.
 */
const CONFIG_DOC = { collection: 'integrations', id: 'siteTripSettings' }

export interface SiteTripSettings {
  /** Pauschale je Anfahrt in EUR (netto); 0 = noch nicht festgelegt */
  flatRateEur: number
  updatedAt?: Date | any
}

export async function getSiteTripSettings(): Promise<SiteTripSettings> {
  await authReady
  try {
    const snap = await getDoc(doc(db, CONFIG_DOC.collection, CONFIG_DOC.id))
    const wert = snap.exists() ? Number((snap.data() as SiteTripSettings).flatRateEur) : 0
    return { flatRateEur: Number.isFinite(wert) && wert > 0 ? wert : 0 }
  } catch (error) {
    console.error('Fehler beim Laden der Kfz-Pauschale:', error)
    return { flatRateEur: 0 }
  }
}

export async function saveSiteTripFlatRate(flatRateEur: number): Promise<void> {
  await authReady
  if (!Number.isFinite(flatRateEur) || flatRateEur < 0) {
    throw new Error('Bitte einen gültigen Betrag angeben.')
  }
  await setDoc(
    doc(db, CONFIG_DOC.collection, CONFIG_DOC.id),
    { flatRateEur: Math.round(flatRateEur * 100) / 100, updatedAt: new Date() },
    { merge: true }
  )
}
