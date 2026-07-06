import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where
} from 'firebase/firestore'
import { db, auth } from '../firebaseConfig'
import type { Employee, LeaveRequest } from '../../types'
import { authReady, isDevMode, postWithIdToken, REGULAR_DAY_MINUTES } from './shared'

export async function getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
  await authReady
  try {
    const leaveRequestsRef = collection(db, 'leaveRequests')
    const q = query(leaveRequestsRef, where('employeeId', '==', employeeId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as LeaveRequest))
  } catch (error) {
    console.error('Fehler beim Abrufen der Urlaubsanträge:', error)
    return []
  }
}

export async function getAllLeaveRequests(): Promise<LeaveRequest[]> {
  await authReady
  try {
    const leaveRequestsRef = collection(db, 'leaveRequests')
    const snapshot = await getDocs(leaveRequestsRef)
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as LeaveRequest))
  } catch (error) {
    console.error('Fehler beim Abrufen aller Urlaubsanträge:', error)
    return []
  }
}

async function triggerLeaveRequestPushNotification(payload: {
  leaveRequestId: string
  employeeId: string | null
  employeeName: string
  startDate: string | null
  endDate: string | null
  type: LeaveRequest['type'] | null
  workingDays: number | null
}): Promise<void> {
  try {
    if (!auth.currentUser) {
      if (isDevMode) {
        console.warn('Push-Trigger übersprungen: kein Firebase Auth User vorhanden')
      }
      return
    }
    await postWithIdToken('/api/push/leave-request', payload)
  } catch (error) {
    // Push-Fehler dürfen den Urlaubsantrag nicht blockieren.
    console.error('Fehler beim Auslösen der Push-Benachrichtigung:', error)
  }
}

export async function createLeaveRequest(requestData: Partial<LeaveRequest>): Promise<string> {
  await authReady
  try {
    const leaveRequestsRef = collection(db, 'leaveRequests')
    const docRef = await addDoc(leaveRequestsRef, {
      ...requestData,
      status: 'pending',
      createdAt: new Date()
    })

    await triggerLeaveRequestPushNotification({
      leaveRequestId: docRef.id,
      employeeId: requestData.employeeId || null,
      employeeName: requestData.employeeName || 'Mitarbeiter',
      startDate: requestData.startDate ? new Date(requestData.startDate as string | Date).toISOString() : null,
      endDate: requestData.endDate ? new Date(requestData.endDate as string | Date).toISOString() : null,
      type: requestData.type || null,
      workingDays: typeof requestData.workingDays === 'number' ? requestData.workingDays : null
    })

    return docRef.id
  } catch (error) {
    console.error('Fehler beim Erstellen des Urlaubsantrags:', error)
    throw error
  }
}

export async function updateLeaveRequest(id: string, requestData: Partial<LeaveRequest>): Promise<void> {
  await authReady
  try {
    const leaveRequestRef = doc(db, 'leaveRequests', id)
    await updateDoc(leaveRequestRef, {
      ...requestData,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Urlaubsantrags:', error)
    throw error
  }
}

export async function approveLeaveRequest(id: string, approvedBy: string): Promise<void> {
  await authReady
  try {
    const leaveRequestRef = doc(db, 'leaveRequests', id)
    await runTransaction(db, async (transaction) => {
      const leaveRequestDoc = await transaction.get(leaveRequestRef)
      if (!leaveRequestDoc.exists()) {
        throw new Error('Urlaubsantrag nicht gefunden')
      }

      const leaveRequest = leaveRequestDoc.data() as LeaveRequest
      if (leaveRequest.status === 'approved') {
        return
      }

      // „Urlaub auf Überstunden": benötigte Stunden vom Überstundenkonto abziehen
      if (leaveRequest.type === 'overtime') {
        const neededMinutes = (Number(leaveRequest.workingDays) || 0) * REGULAR_DAY_MINUTES
        const employeeRef = doc(db, 'employees', leaveRequest.employeeId)
        const employeeDoc = await transaction.get(employeeRef)
        if (!employeeDoc.exists()) {
          throw new Error('Mitarbeiter nicht gefunden')
        }
        const current = Number((employeeDoc.data() as Employee).overtimeBalanceMinutes) || 0
        if (current < neededMinutes) {
          throw new Error('Nicht genügend Überstunden für diesen Antrag vorhanden.')
        }
        transaction.update(employeeRef, {
          overtimeBalanceMinutes: current - neededMinutes,
          updatedAt: new Date()
        })
      }

      transaction.update(leaveRequestRef, {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
    })
  } catch (error) {
    console.error('Fehler beim Genehmigen des Urlaubsantrags:', error)
    throw error
  }
}

export async function rejectLeaveRequest(id: string, rejectionReason: string): Promise<void> {
  await authReady
  try {
    const leaveRequestRef = doc(db, 'leaveRequests', id)
    await updateDoc(leaveRequestRef, {
      status: 'rejected',
      rejectionReason,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Fehler beim Ablehnen des Urlaubsantrags:', error)
    throw error
  }
}

export async function deleteLeaveRequest(id: string): Promise<void> {
  await authReady
  try {
    const leaveRequestRef = doc(db, 'leaveRequests', id)
    await deleteDoc(leaveRequestRef)
  } catch (error) {
    console.error('Fehler beim Löschen des Urlaubsantrags:', error)
    throw error
  }
}
