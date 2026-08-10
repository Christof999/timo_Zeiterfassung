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
import { authReady, isDevMode, postWithIdToken } from './shared'
import { regularMinutesForRange } from '../../utils/regularWorkTime'
import { getBavariaHolidayName } from '../../utils/bavariaHolidays'

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

/** Firestore-Timestamp, Date oder String robust in ein Date wandeln. */
function toDateValue(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const withToDate = value as { toDate?: () => Date; seconds?: number }
  if (typeof withToDate.toDate === 'function') return withToDate.toDate()
  if (typeof withToDate.seconds === 'number') return new Date(withToDate.seconds * 1000)
  const parsed = new Date(value as string | number)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Krankheits- und Berufsschultage werden vom Admin gemeldet, nicht beantragt:
 * der Eintrag wird direkt als genehmigt gespeichert und löst keine
 * Benachrichtigung aus. Gezählt werden nur Werktage ohne gesetzlichen Feiertag
 * — an einem Feiertag ist niemand krank oder in der Berufsschule.
 *
 * Beide Arten laufen bewusst am Urlaubskonto vorbei: sie werden weder beantragt
 * noch vom Urlaubsanspruch abgezogen.
 */
async function reportAbsence(
  type: 'sick' | 'school',
  data: {
    employeeId: string
    employeeName?: string
    startDate: Date
    endDate: Date
    reason?: string
    reportedBy?: string
  }
): Promise<string> {
  await authReady
  const current = new Date(data.startDate)
  current.setHours(12, 0, 0, 0)
  const last = new Date(data.endDate)
  last.setHours(12, 0, 0, 0)

  let workingDays = 0
  while (current <= last) {
    const day = current.getDay()
    if (day !== 0 && day !== 6 && !getBavariaHolidayName(current)) workingDays++
    current.setDate(current.getDate() + 1)
  }
  if (workingDays === 0) {
    throw new Error('Im gewählten Zeitraum liegt kein Arbeitstag (Wochenenden und Feiertage zählen nicht).')
  }

  const leaveRequestsRef = collection(db, 'leaveRequests')
  const docRef = await addDoc(leaveRequestsRef, {
    employeeId: data.employeeId,
    employeeName: data.employeeName || '',
    startDate: data.startDate,
    endDate: data.endDate,
    type,
    reason: data.reason || '',
    workingDays,
    status: 'approved',
    approvedBy: data.reportedBy || 'Admin',
    approvedAt: new Date(),
    createdAt: new Date()
  })
  return docRef.id
}

export const reportSickLeave = (data: {
  employeeId: string
  employeeName?: string
  startDate: Date
  endDate: Date
  reason?: string
  reportedBy?: string
}): Promise<string> => reportAbsence('sick', data)

/** Berufsschultage eines Azubis – auf dem Nachweis der Grund für den freien Tag. */
export const reportSchoolDays = (data: {
  employeeId: string
  employeeName?: string
  startDate: Date
  endDate: Date
  reason?: string
  reportedBy?: string
}): Promise<string> => reportAbsence('school', data)

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
        // Regelarbeitszeit des tatsächlichen Zeitraums (Mo–Do 8 Std, Fr 6 Std)
        // statt einer Tagespauschale — ein Freitag kostet nur 6 Std.
        const rangeStart = toDateValue(leaveRequest.startDate)
        const rangeEnd = toDateValue(leaveRequest.endDate)
        const neededMinutes =
          rangeStart && rangeEnd ? regularMinutesForRange(rangeStart, rangeEnd) : 0
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
