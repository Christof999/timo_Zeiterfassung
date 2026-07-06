import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Vehicle, VehicleUsage } from '../../types'
import { authReady } from './shared'

export async function getAllVehicles(): Promise<Vehicle[]> {
  await authReady
  try {
    const vehiclesRef = collection(db, 'vehicles')
    const snapshot = await getDocs(vehiclesRef)
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle))
  } catch (error) {
    console.error('Fehler beim Abrufen der Fahrzeuge:', error)
    return []
  }
}

export async function createVehicle(vehicleData: Partial<Vehicle>): Promise<string> {
  await authReady
  try {
    const vehiclesRef = collection(db, 'vehicles')
    const docRef = await addDoc(vehiclesRef, {
      ...vehicleData,
      createdAt: new Date()
    })
    return docRef.id
  } catch (error) {
    console.error('Fehler beim Erstellen des Fahrzeugs:', error)
    throw error
  }
}

export async function updateVehicle(id: string, vehicleData: Partial<Vehicle>): Promise<void> {
  await authReady
  try {
    const vehicleRef = doc(db, 'vehicles', id)
    await updateDoc(vehicleRef, {
      ...vehicleData,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Fahrzeugs:', error)
    throw error
  }
}

export async function deleteVehicle(id: string): Promise<void> {
  await authReady
  try {
    const vehicleRef = doc(db, 'vehicles', id)
    const vehicleDoc = await getDoc(vehicleRef)
    if (!vehicleDoc.exists()) {
      return
    }

    const vehicle = vehicleDoc.data() as Vehicle
    const vehicleName = vehicle.name || ''

    // Namen an bestehenden Nutzungen hinterlegen, damit sie nach dem Löschen
    // des Fahrzeugs noch lesbar bleiben.
    if (vehicleName) {
      const vehicleUsagesRef = collection(db, 'vehicleUsages')
      const usageQuery = query(vehicleUsagesRef, where('vehicleId', '==', id))
      const usageSnapshot = await getDocs(usageQuery)

      const updatePromises = usageSnapshot.docs
        .filter((usageDoc) => {
          const usage = usageDoc.data() as VehicleUsage
          return !usage.vehicleName
        })
        .map((usageDoc) => updateDoc(usageDoc.ref, { vehicleName }))

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises)
      }
    }

    await deleteDoc(vehicleRef)
  } catch (error) {
    console.error(`Fehler beim Löschen des Fahrzeugs ${id}:`, error)
    throw error
  }
}

export async function getVehicleUsagesByProject(projectId: string): Promise<VehicleUsage[]> {
  await authReady
  try {
    const vehicleUsagesRef = collection(db, 'vehicleUsages')
    const q = query(vehicleUsagesRef, where('projectId', '==', projectId))
    const snapshot = await getDocs(q)

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VehicleUsage))
  } catch (error) {
    console.error('Fehler beim Abrufen der Fahrzeugnutzungen:', error)
    return []
  }
}

export async function getVehicleUsagesByEmployeeId(employeeId: string): Promise<VehicleUsage[]> {
  await authReady
  try {
    if (!employeeId) return []
    const vehicleUsagesRef = collection(db, 'vehicleUsages')
    const q = query(vehicleUsagesRef, where('employeeId', '==', employeeId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VehicleUsage))
  } catch (error) {
    console.error('Fehler beim Abrufen der Fahrzeugnutzungen (Mitarbeiter):', error)
    return []
  }
}

export async function getVehicleUsagesByTimeEntryId(timeEntryId: string): Promise<VehicleUsage[]> {
  await authReady
  try {
    if (!timeEntryId) return []
    const vehicleUsagesRef = collection(db, 'vehicleUsages')
    const q = query(vehicleUsagesRef, where('timeEntryId', '==', timeEntryId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VehicleUsage))
  } catch (error) {
    console.error('Fehler beim Abrufen der Fahrzeugnutzungen (Zeiteintrag):', error)
    return []
  }
}

export async function addVehicleUsage(usageData: Partial<VehicleUsage>): Promise<VehicleUsage> {
  await authReady
  try {
    const vehicleUsagesRef = collection(db, 'vehicleUsages')
    const normalizedUsageData: Partial<VehicleUsage> = { ...usageData }

    if (!normalizedUsageData.vehicleName && normalizedUsageData.vehicleId) {
      const vehicleRef = doc(db, 'vehicles', normalizedUsageData.vehicleId)
      const vehicleDoc = await getDoc(vehicleRef)
      if (vehicleDoc.exists()) {
        const vehicleData = vehicleDoc.data() as Vehicle
        normalizedUsageData.vehicleName = vehicleData.name
      }
    }

    const rawPayload = {
      ...normalizedUsageData,
      createdAt: serverTimestamp()
    }
    // Firestore lehnt undefined in Feldern ab (z. B. optionales comment)
    const payload = Object.fromEntries(
      Object.entries(rawPayload).filter(([, value]) => value !== undefined)
    )

    const docRef = await addDoc(vehicleUsagesRef, payload)
    const usageDoc = await getDoc(docRef)

    return { id: docRef.id, ...usageDoc.data() } as VehicleUsage
  } catch (error) {
    console.error('Fehler beim Erstellen der Fahrzeugnutzung:', error)
    throw error
  }
}
