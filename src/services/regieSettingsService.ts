import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebaseConfig'
import { authReady } from './data/shared'

/**
 * Schalter, ob Mitarbeiter nach dem Ausstempeln den Regiezettel zum
 * Unterschreiben angeboten bekommen. Liegt in Firestore, damit der Admin ihn
 * für alle Geräte gleichzeitig umlegt. Ohne Eintrag ist er aus.
 */
const CONFIG_DOC = { collection: 'integrations', id: 'regieSettings' }

export async function isRegieZettelEnabled(): Promise<boolean> {
  await authReady
  try {
    const snap = await getDoc(doc(db, CONFIG_DOC.collection, CONFIG_DOC.id))
    return snap.exists() && snap.data().employeeRegieEnabled === true
  } catch (error) {
    // Im Zweifel nichts an den Kunden ausliefern.
    console.error('Fehler beim Laden der Regiezettel-Einstellung:', error)
    return false
  }
}

export async function setRegieZettelEnabled(enabled: boolean): Promise<void> {
  await authReady
  await setDoc(
    doc(db, CONFIG_DOC.collection, CONFIG_DOC.id),
    { employeeRegieEnabled: enabled, updatedAt: new Date() },
    { merge: true }
  )
}
