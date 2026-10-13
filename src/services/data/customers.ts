import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Customer } from '../../types'
import { authReady } from './shared'
import { getInvoiceCustomers } from './invoiceCustomers'

/**
 * Kundenstamm – maßgeblich ist das Rechnungsprogramm. Dort werden Kunden
 * angelegt und gepflegt; die Zeiterfassung liest nur (siehe invoiceCustomers.ts).
 */
export async function getAllCustomers(): Promise<Customer[]> {
  return getInvoiceCustomers()
}

/** Kunden zur Auswahl (Projekt, Kleinauftrag, Besichtigung). */
export async function getActiveCustomers(): Promise<Customer[]> {
  const customers = await getAllCustomers()
  return customers.filter((c) => c.isActive !== false)
}

/**
 * Frühere Kunden aus der eigenen `customers`-Collection der Zeiterfassung
 * (HERO-Import, von Hand angelegt). Sie stehen nirgends mehr zur Auswahl; die
 * Diagnose braucht sie noch, um alte Kleinauftrag-Buchungen zuzuordnen.
 */
export async function getLegacyCustomers(): Promise<Customer[]> {
  await authReady
  try {
    const snapshot = await getDocs(collection(db, 'customers'))
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Customer))
  } catch (error) {
    console.error('Fehler beim Abrufen der früheren Kunden:', error)
    return []
  }
}
