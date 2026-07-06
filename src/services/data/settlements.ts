import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Employee, TimeReportSettlement } from '../../types'
import { authReady } from './shared'

export function settlementDocId(employeeId: string, periodStart: string, periodEnd: string): string {
  return `${employeeId}_${periodStart}_${periodEnd}`.replace(/\//g, '-')
}

export async function saveTimeReportSettlement(
  data: Omit<TimeReportSettlement, 'id' | 'settledAt'>
): Promise<void> {
  await authReady
  const id = settlementDocId(data.employeeId, data.periodStart, data.periodEnd)
  const settlementRef = doc(db, 'timeReportSettlements', id)

  try {
    await setDoc(settlementRef, {
      ...data,
      settledAt: new Date()
    })
  } catch (error: unknown) {
    console.error('Fehler beim Speichern der Zeiterfassungs-Abrechnung:', error)
    const code = (error as { code?: string })?.code
    if (code === 'permission-denied') {
      throw new Error(
        'Keine Berechtigung für „timeReportSettlements“ in Firestore. Bitte in den Security Rules Lesen/Schreiben für angemeldete Nutzer erlauben.'
      )
    }
    throw error
  }

  try {
    const empRef = doc(db, 'employees', data.employeeId)
    const empSnap = await getDoc(empRef)
    if (empSnap.exists()) {
      const emp = empSnap.data() as Employee
      const paid = Number(data.paidOutMinutes) || 0
      if (emp.overtimeBalanceMinutes != null && typeof emp.overtimeBalanceMinutes === 'number') {
        const next = Math.max(0, emp.overtimeBalanceMinutes - paid)
        await updateDoc(empRef, { overtimeBalanceMinutes: next })
      }
    }
  } catch (error) {
    console.warn('Abrechnung gespeichert, aber Überstunden-Saldo am Mitarbeiter konnte nicht angepasst werden:', error)
  }
}

export async function getTimeReportSettlement(
  employeeId: string,
  periodStart: string,
  periodEnd: string
): Promise<TimeReportSettlement | null> {
  await authReady
  try {
    const id = settlementDocId(employeeId, periodStart, periodEnd)
    const settlementRef = doc(db, 'timeReportSettlements', id)
    const snap = await getDoc(settlementRef)
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as TimeReportSettlement
  } catch (error) {
    console.error('Fehler beim Laden der Zeiterfassungs-Abrechnung:', error)
    return null
  }
}

/** Arbeitstage (Mo–Fr) zwischen zwei Daten, beide inklusive. */
export function calculateWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    const dayOfWeek = current.getDay()
    // 0 = Sonntag, 6 = Samstag
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }

  return count
}
