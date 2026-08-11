import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Customer } from '../../types'
import { authReady } from './shared'

/**
 * Grabstein-Collection für gelöschte HERO-Kunden.
 *
 * Ein aus HERO importierter Kunde wird beim nächsten Sync anhand seiner
 * `heroCustomerId` wieder angelegt – aus Sicht des Anwenders „lässt er sich
 * nicht löschen“. Beim Löschen merken wir uns die HERO-ID daher hier; der Sync
 * (lib/hero/syncProjects.js) überspringt alle Kunden mit Grabstein.
 */
const HERO_CUSTOMER_DELETIONS = 'heroCustomerDeletions'

/** Wandelt Firestore-Fehler in eine verständliche deutsche Meldung um. */
function describeFirestoreError(error: unknown, fallback: string): Error {
  const code = (error as { code?: string })?.code
  if (code === 'permission-denied') {
    return new Error(
      'Keine Berechtigung (Firestore-Regeln). Bitte in der Firebase Console prüfen, ' +
        'ob die Collection "customers" Schreib-/Löschzugriff für angemeldete Nutzer erlaubt.'
    )
  }
  if (code === 'unauthenticated') {
    return new Error(
      'Nicht angemeldet. In Firebase → Authentication muss der Anbieter „Anonym“ aktiv und die Domain freigegeben sein.'
    )
  }
  const message = (error as { message?: string })?.message
  return new Error(message ? `${fallback}: ${message}` : fallback)
}

export async function getAllCustomers(): Promise<Customer[]> {
  await authReady
  try {
    const customersRef = collection(db, 'customers')
    const snapshot = await getDocs(customersRef)
    const customers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Customer))
    return customers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
  } catch (error) {
    console.error('Fehler beim Abrufen der Kunden:', error)
    return []
  }
}

export async function getActiveCustomers(): Promise<Customer[]> {
  const customers = await getAllCustomers()
  return customers.filter((c) => c.isActive !== false)
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  await authReady
  if (!id) return null
  try {
    const customerRef = doc(db, 'customers', id)
    const customerDoc = await getDoc(customerRef)
    if (!customerDoc.exists()) return null
    return { id: customerDoc.id, ...customerDoc.data() } as Customer
  } catch (error) {
    console.error('Fehler beim Abrufen des Kunden:', error)
    return null
  }
}

export async function createCustomer(customerData: Partial<Customer>): Promise<string> {
  await authReady
  try {
    const customersRef = collection(db, 'customers')
    const payload = {
      ...customerData,
      source: customerData.source || 'manual',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )
    const docRef = await addDoc(customersRef, cleaned)
    return docRef.id
  } catch (error) {
    console.error('Fehler beim Erstellen des Kunden:', error)
    throw error
  }
}

export async function updateCustomer(id: string, customerData: Partial<Customer>): Promise<void> {
  await authReady
  try {
    const customerRef = doc(db, 'customers', id)
    const payload = { ...customerData, updatedAt: new Date() }
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )
    await updateDoc(customerRef, cleaned)
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Kunden:', error)
    throw error
  }
}

export async function deleteCustomer(id: string): Promise<void> {
  await authReady

  // HERO-ID vor dem Löschen lesen – danach ist das Dokument weg.
  let heroCustomerId: string | undefined
  try {
    const existing = await getDoc(doc(db, 'customers', id))
    const heroId = existing.exists() ? (existing.data() as Customer).heroCustomerId : undefined
    heroCustomerId = heroId ? String(heroId) : undefined
  } catch (error) {
    console.warn(`HERO-ID des Kunden ${id} konnte nicht gelesen werden:`, error)
  }

  try {
    await deleteDoc(doc(db, 'customers', id))
  } catch (error) {
    console.error(`Fehler beim Löschen des Kunden ${id}:`, error)
    throw describeFirestoreError(error, 'Kunde konnte nicht gelöscht werden')
  }

  // Grabstein erst nach erfolgreichem Löschen setzen, sonst würde ein
  // fehlgeschlagener Löschversuch den Kunden dauerhaft vom Sync ausschließen.
  if (heroCustomerId) {
    try {
      await setDoc(doc(db, HERO_CUSTOMER_DELETIONS, heroCustomerId), {
        heroCustomerId,
        deletedAt: new Date()
      })
    } catch (error) {
      // Der Kunde ist gelöscht – nur der Wiederanlage-Schutz fehlt.
      console.error(
        `Löschmarker für HERO-Kunde ${heroCustomerId} konnte nicht gesetzt werden – ` +
          'der Kunde kann beim nächsten HERO-Sync erneut angelegt werden:',
        error
      )
    }
  }
}

/** HERO-IDs, die bewusst gelöscht wurden und nicht erneut importiert werden. */
export async function getDeletedHeroCustomerIds(): Promise<string[]> {
  await authReady
  try {
    const snapshot = await getDocs(collection(db, HERO_CUSTOMER_DELETIONS))
    return snapshot.docs.map((docSnap) => docSnap.id)
  } catch (error) {
    console.error('Fehler beim Abrufen der gelöschten HERO-Kunden:', error)
    return []
  }
}

/** Hebt die Löschsperre auf, damit der Kunde beim nächsten Sync wieder importiert wird. */
export async function restoreHeroCustomer(heroCustomerId: string): Promise<void> {
  await authReady
  try {
    await deleteDoc(doc(db, HERO_CUSTOMER_DELETIONS, String(heroCustomerId)))
  } catch (error) {
    console.error(`Fehler beim Aufheben der Löschsperre für ${heroCustomerId}:`, error)
    throw describeFirestoreError(error, 'Löschsperre konnte nicht aufgehoben werden')
  }
}
