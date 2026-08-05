import { collection, doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Employee, OvertimeSettlement } from '../../types'
import { authReady } from './shared'
import { minutesToHoursLabel } from '../../utils/hoursInput'
import { nextBalanceForSettlement, overtimeSettlementDocId } from '../../utils/overtimeBalance'

const COLLECTION = 'overtimeSettlements'

export { overtimeSettlementDocId }

export async function getOvertimeSettlements(employeeId: string): Promise<OvertimeSettlement[]> {
  await authReady
  if (!employeeId) return []
  try {
    const settlementsQuery = query(
      collection(db, COLLECTION),
      where('employeeId', '==', employeeId)
    )
    const snapshot = await getDocs(settlementsQuery)
    return snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }) as OvertimeSettlement)
      .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
  } catch (error) {
    console.error('Fehler beim Laden der Überstunden-Verrechnungen:', error)
    throw error
  }
}

export async function getOvertimeSettlement(
  employeeId: string,
  month: string
): Promise<OvertimeSettlement | null> {
  await authReady
  if (!employeeId || !month) return null
  try {
    const snapshot = await getDoc(doc(db, COLLECTION, overtimeSettlementDocId(employeeId, month)))
    if (!snapshot.exists()) return null
    return { id: snapshot.id, ...snapshot.data() } as OvertimeSettlement
  } catch (error) {
    console.error('Fehler beim Laden der Überstunden-Verrechnung:', error)
    return null
  }
}

/**
 * Meldet für einen Monat, wie viele der geleisteten Stunden abgerechnet werden
 * sollen. Der nicht abgerechnete Rest wird dem Überstundenkonto gutgeschrieben.
 *
 * Gebucht wird nur die Differenz zum bisherigen Beitrag desselben Monats –
 * dadurch bleibt der Eintrag änderbar, ohne dass das Konto mehrfach wandert.
 *
 * Läuft als Transaktion: Kontostand und Monatswert dürfen nie auseinanderlaufen.
 *
 * @param workedMinutes im Monat geleistete Arbeitszeit
 * @param minutes davon abzurechnen
 * @returns der neue Kontostand in Minuten
 */
export async function setOvertimeSettlementMinutes(
  employeeId: string,
  month: string,
  minutes: number,
  workedMinutes: number
): Promise<number> {
  await authReady
  if (!employeeId) throw new Error('Kein Mitarbeiter angegeben.')
  if (!month) throw new Error('Kein Monat angegeben.')
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error('Die Stundenangabe ist ungültig.')
  }
  if (!Number.isFinite(workedMinutes) || workedMinutes < 0) {
    throw new Error('Die geleisteten Stunden konnten nicht ermittelt werden.')
  }
  if (minutes > workedMinutes) {
    throw new Error(
      `Es können höchstens die geleisteten ${minutesToHoursLabel(Math.round(workedMinutes))} Std abgerechnet werden.`
    )
  }

  const wanted = Math.round(minutes)
  const worked = Math.round(workedMinutes)

  try {
    return await runTransaction(db, async (transaction) => {
      const settlementRef = doc(db, COLLECTION, overtimeSettlementDocId(employeeId, month))
      const employeeRef = doc(db, 'employees', employeeId)

      // Firestore verlangt alle Lesevorgänge vor dem ersten Schreibvorgang.
      const settlementSnap = await transaction.get(settlementRef)
      const employeeSnap = await transaction.get(employeeRef)

      if (!employeeSnap.exists()) throw new Error('Mitarbeiter nicht gefunden.')

      const employee = employeeSnap.data() as Employee
      const balance =
        typeof employee.overtimeBalanceMinutes === 'number' &&
        Number.isFinite(employee.overtimeBalanceMinutes)
          ? employee.overtimeBalanceMinutes
          : 0
      const previous = settlementSnap.exists()
        ? (settlementSnap.data() as OvertimeSettlement)
        : null

      const nextBalance = nextBalanceForSettlement(balance, previous, worked, wanted)
      if (nextBalance === null) {
        // Kann nur passieren, wenn eine frühere Gutschrift dieses Monats
        // inzwischen anderweitig verbraucht wurde (z. B. Urlaub auf Überstunden).
        throw new Error(
          'Die Änderung würde das Überstundenkonto ins Minus bringen. Bitte im Büro melden.'
        )
      }

      if (settlementSnap.exists()) {
        transaction.update(settlementRef, {
          minutes: wanted,
          workedMinutes: worked,
          updatedAt: new Date()
        })
      } else {
        transaction.set(settlementRef, {
          employeeId,
          month,
          minutes: wanted,
          workedMinutes: worked,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }

      if (nextBalance !== balance) {
        transaction.update(employeeRef, { overtimeBalanceMinutes: nextBalance })
      }

      return nextBalance
    })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'permission-denied') {
      throw new Error(
        'Keine Berechtigung für „overtimeSettlements“ in Firestore. Bitte in den Security Rules Lesen/Schreiben für angemeldete Nutzer erlauben.'
      )
    }
    throw error
  }
}
