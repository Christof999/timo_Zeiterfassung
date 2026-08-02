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
 * Setzt die für einen Monat verrechneten Überstunden auf `minutes` und bucht
 * ausschließlich die Differenz zum bisherigen Wert gegen das Überstundenkonto.
 * Dadurch bleibt der Eintrag den ganzen Monat über änderbar, ohne dass das
 * Konto bei jeder Korrektur erneut belastet wird.
 *
 * Läuft als Transaktion: Kontostand und Monatswert dürfen nie auseinanderlaufen.
 *
 * @returns der neue Kontostand in Minuten
 */
export async function setOvertimeSettlementMinutes(
  employeeId: string,
  month: string,
  minutes: number
): Promise<number> {
  await authReady
  if (!employeeId) throw new Error('Kein Mitarbeiter angegeben.')
  if (!month) throw new Error('Kein Monat angegeben.')
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error('Die Stundenangabe ist ungültig.')
  }

  const wanted = Math.round(minutes)

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
        ? Number((settlementSnap.data() as OvertimeSettlement).minutes) || 0
        : 0

      const delta = wanted - previous
      const nextBalance = nextBalanceForSettlement(balance, previous, wanted)
      if (nextBalance === null) {
        // Bereits verrechnete Stunden dieses Monats stehen weiter zur
        // Verfügung – sie wurden ja schon abgezogen.
        const available = balance + previous
        throw new Error(
          `Nicht genügend Überstunden: verfügbar sind ${minutesToHoursLabel(available)} Std.`
        )
      }

      if (settlementSnap.exists()) {
        transaction.update(settlementRef, { minutes: wanted, updatedAt: new Date() })
      } else {
        transaction.set(settlementRef, {
          employeeId,
          month,
          minutes: wanted,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }

      if (delta !== 0) {
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
