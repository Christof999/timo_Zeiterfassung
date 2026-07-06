import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where
} from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Employee } from '../../types'
import { authReady } from './shared'

export async function getAllEmployees(): Promise<Employee[]> {
  await authReady
  try {
    const employeesRef = collection(db, 'employees')
    const snapshot = await getDocs(employeesRef)
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Employee))
  } catch (error) {
    console.error('Fehler beim Abrufen aller Mitarbeiter:', error)
    return []
  }
}

export async function getAllActiveEmployees(): Promise<Employee[]> {
  await authReady
  try {
    const employeesRef = collection(db, 'employees')
    const snapshot = await getDocs(employeesRef)
    const allEmployees = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Employee))

    return allEmployees.filter(
      (employee) => employee.status !== 'inactive' && employee.name !== 'Administrator'
    )
  } catch (error) {
    console.error('Fehler beim Abrufen der aktiven Mitarbeiter:', error)
    return []
  }
}

export async function createEmployee(employeeData: Partial<Employee>): Promise<string> {
  await authReady
  try {
    // Prüfe auf doppelten Benutzernamen – nur gegen AKTIVE Mitarbeiter.
    // (Gelöschte/inaktive blockieren den Benutzernamen nicht mehr.)
    const employeesRef = collection(db, 'employees')
    const q = query(employeesRef, where('username', '==', employeeData.username))
    const existingSnapshot = await getDocs(q)
    const hasActiveDuplicate = existingSnapshot.docs.some(
      (d) => (d.data() as Employee).status !== 'inactive'
    )
    if (hasActiveDuplicate) {
      throw new Error('Dieser Benutzername ist bereits vergeben.')
    }

    // Standard-Urlaubsdaten hinzufügen
    if (!employeeData.vacationDays) {
      employeeData.vacationDays = {
        total: 30,
        used: 0,
        year: new Date().getFullYear()
      }
    }

    const docRef = await addDoc(employeesRef, employeeData)
    return docRef.id
  } catch (error) {
    console.error('Fehler beim Erstellen des Mitarbeiters:', error)
    throw error
  }
}

export async function updateEmployee(id: string, employeeData: Partial<Employee>): Promise<void> {
  await authReady
  try {
    if (!id) {
      throw new Error('Keine gültige Mitarbeiter-ID angegeben')
    }

    // Prüfe auf doppelten Benutzernamen (außer dem aktuellen, nur AKTIVE)
    if (employeeData.username) {
      const employeesRef = collection(db, 'employees')
      const q = query(employeesRef, where('username', '==', employeeData.username))
      const existingSnapshot = await getDocs(q)
      const hasOtherActiveDuplicate = existingSnapshot.docs.some(
        (d) => d.id !== id && (d.data() as Employee).status !== 'inactive'
      )
      if (hasOtherActiveDuplicate) {
        throw new Error('Dieser Benutzername ist bereits vergeben.')
      }
    }

    const employeeRef = doc(db, 'employees', id)
    await updateDoc(employeeRef, employeeData)
  } catch (error) {
    console.error(`Fehler beim Aktualisieren des Mitarbeiters ${id}:`, error)
    throw error
  }
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  await authReady
  if (!id) return null
  try {
    const snap = await getDoc(doc(db, 'employees', id))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Employee) : null
  } catch (error) {
    console.error(`Fehler beim Laden des Mitarbeiters ${id}:`, error)
    return null
  }
}

export async function deleteEmployee(id: string): Promise<void> {
  await authReady
  try {
    // Prüfe auf aktive Zeiteinträge
    const timeEntriesRef = collection(db, 'timeEntries')
    const q = query(
      timeEntriesRef,
      where('employeeId', '==', id),
      where('clockOutTime', '==', null),
      limit(1)
    )
    const activeEntries = await getDocs(q)

    if (!activeEntries.empty) {
      throw new Error('Dieser Mitarbeiter hat noch aktive Zeiteinträge und kann nicht gelöscht werden.')
    }

    // Mitarbeiter wirklich entfernen.
    const employeeRef = doc(db, 'employees', id)
    await deleteDoc(employeeRef)
  } catch (error) {
    console.error(`Fehler beim Löschen des Mitarbeiters ${id}:`, error)
    throw error
  }
}
