import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Customer } from '../../types'
import { authReady } from './shared'

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
  try {
    await deleteDoc(doc(db, 'customers', id))
  } catch (error) {
    console.error(`Fehler beim Löschen des Kunden ${id}:`, error)
    throw error
  }
}
