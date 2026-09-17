import { doc, runTransaction } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { Employee, TimeEntry } from '../../types'
import { authReady } from './shared'
import { minutesToHoursLabel } from '../../utils/hoursInput'

/**
 * „Tag mit Überstunden auffüllen" – die Buchung.
 *
 * Die aufgefüllten Minuten landen auf dem letzten abgeschlossenen Stempelsatz
 * des Tages (dort endet der Arbeitstag, dort schlägt auch der Bericht
 * Überstunden auf) und werden im selben Zug vom Überstundenkonto abgezogen.
 *
 * Läuft als Transaktion: Kontostand und gebuchte Zeit dürfen nie
 * auseinanderlaufen. Kontostand und Obergrenze werden dabei noch einmal gegen
 * die frischen Daten geprüft – nicht gegen das, was der Browser mitschickt.
 */

export interface OvertimeDayFillResult {
  /** Neuer Stand des Überstundenkontos in Minuten. */
  balanceMinutes: number
  /** Gesamte Auffüllung des Tages nach der Buchung. */
  entryFillMinutes: number
}

export interface OvertimeDayFillParams {
  employeeId: string
  /** Stempelsatz, der die Auffüllung trägt (letztes Ausstempeln des Tages). */
  timeEntryId: string
  /** Zusätzlich aufzufüllende Minuten. */
  minutes: number
  /** Regelarbeitszeit des Tages – ein einzelner Tag kann nie mehr tragen. */
  regularMinutes: number
}

export async function bookOvertimeDayFill({
  employeeId,
  timeEntryId,
  minutes,
  regularMinutes
}: OvertimeDayFillParams): Promise<OvertimeDayFillResult> {
  await authReady
  if (!employeeId) throw new Error('Kein Mitarbeiter angegeben.')
  if (!timeEntryId) throw new Error('Kein Stempelsatz für die Auffüllung gefunden.')
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('Für diesen Tag gibt es nichts aufzufüllen.')
  }
  const wanted = Math.round(minutes)

  try {
    return await runTransaction(db, async (transaction) => {
      const employeeRef = doc(db, 'employees', employeeId)
      const entryRef = doc(db, 'timeEntries', timeEntryId)

      // Firestore verlangt alle Lesevorgänge vor dem ersten Schreibvorgang.
      const employeeSnap = await transaction.get(employeeRef)
      const entrySnap = await transaction.get(entryRef)

      if (!employeeSnap.exists()) throw new Error('Mitarbeiter nicht gefunden.')
      if (!entrySnap.exists()) throw new Error('Stempelsatz nicht gefunden.')

      const employee = employeeSnap.data() as Employee
      const entry = entrySnap.data() as TimeEntry

      if (entry.employeeId !== employeeId) {
        throw new Error('Der Stempelsatz gehört zu einem anderen Mitarbeiter.')
      }

      const balance =
        typeof employee.overtimeBalanceMinutes === 'number' &&
        Number.isFinite(employee.overtimeBalanceMinutes)
          ? Math.max(0, employee.overtimeBalanceMinutes)
          : 0
      if (wanted > balance) {
        throw new Error(
          `Auf dem Überstundenkonto liegen nur ${minutesToHoursLabel(balance)} Std.`
        )
      }

      const alreadyFilled = Math.max(0, Math.round(Number(entry.overtimeFillMinutes) || 0))
      const nextFill = alreadyFilled + wanted
      // Ein Tag kann nie mehr als seine Regelarbeitszeit aus dem Konto ziehen.
      if (regularMinutes > 0 && nextFill > regularMinutes) {
        throw new Error('Der Tag ist bereits auf die Regelarbeitszeit aufgefüllt.')
      }

      transaction.update(entryRef, {
        overtimeFillMinutes: nextFill,
        overtimeFillAt: new Date()
      })
      transaction.update(employeeRef, {
        overtimeBalanceMinutes: balance - wanted,
        updatedAt: new Date()
      })

      return { balanceMinutes: balance - wanted, entryFillMinutes: nextFill }
    })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'permission-denied') {
      throw new Error('Keine Berechtigung, die Stunden aufzufüllen.')
    }
    throw error
  }
}

/**
 * Gibt eine zu hoch gebuchte Auffüllung ganz oder teilweise ans Konto zurück.
 *
 * Nötig, wenn der Tag nach der Buchung noch gewachsen ist – der Mitarbeiter
 * stempelt sich am selben Tag noch einmal ein, oder der Admin korrigiert eine
 * Zeit nach oben. Ohne die Rückgabe stünde der Tag über seiner
 * Regelarbeitszeit, obwohl dafür keine Arbeit vorliegt.
 */
export async function releaseOvertimeDayFill({
  employeeId,
  timeEntryId,
  minutes
}: {
  employeeId: string
  timeEntryId: string
  minutes: number
}): Promise<void> {
  await authReady
  if (!employeeId || !timeEntryId) return
  if (!Number.isFinite(minutes) || minutes <= 0) return
  const giveBack = Math.round(minutes)

  await runTransaction(db, async (transaction) => {
    const employeeRef = doc(db, 'employees', employeeId)
    const entryRef = doc(db, 'timeEntries', timeEntryId)

    const employeeSnap = await transaction.get(employeeRef)
    const entrySnap = await transaction.get(entryRef)
    if (!employeeSnap.exists() || !entrySnap.exists()) return

    const employee = employeeSnap.data() as Employee
    const entry = entrySnap.data() as TimeEntry
    if (entry.employeeId !== employeeId) return

    const currentFill = Math.max(0, Math.round(Number(entry.overtimeFillMinutes) || 0))
    // Nie mehr zurückgeben, als dort tatsächlich gebucht ist.
    const released = Math.min(giveBack, currentFill)
    if (released <= 0) return

    const balance = Math.max(0, Number(employee.overtimeBalanceMinutes) || 0)

    transaction.update(entryRef, { overtimeFillMinutes: currentFill - released })
    transaction.update(employeeRef, {
      overtimeBalanceMinutes: balance + released,
      updatedAt: new Date()
    })
  })
}
