import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { authReady, convertToDate, postWithIdToken } from './shared'
import { monthKeyLabel } from '../../utils/overtimeMonth'

/**
 * Monatsend-Aufruf des Admins an alle Mitarbeiter: „Bitte abzurechnende
 * Stunden hinterlegen."
 *
 * Ein einziges Dokument, das der Admin beschreibt und die Mitarbeiter-App live
 * mitliest. Damit erscheint das Popup auch bei geöffneter App sofort und nicht
 * erst beim nächsten Laden.
 */
export interface OvertimeReminderBroadcast {
  /** Monat, für den erinnert wird ("YYYY-MM") */
  month: string
  /** Zeitpunkt des Auslösens – dient dem Client als Dedupe-Schlüssel */
  triggeredAt: Date
  triggeredByName?: string
}

const BROADCAST_DOC = { collection: 'integrations', id: 'overtimeReminderBroadcast' }

const toBroadcast = (data: any): OvertimeReminderBroadcast | null => {
  if (!data?.month) return null
  const triggeredAt = convertToDate(data.triggeredAt)
  if (!triggeredAt) return null
  return {
    month: data.month,
    triggeredAt,
    triggeredByName: data.triggeredByName || undefined
  }
}

export async function getOvertimeReminderBroadcast(): Promise<OvertimeReminderBroadcast | null> {
  await authReady
  try {
    const snap = await getDoc(doc(db, BROADCAST_DOC.collection, BROADCAST_DOC.id))
    return snap.exists() ? toBroadcast(snap.data()) : null
  } catch (error) {
    console.error('Fehler beim Laden der Überstunden-Erinnerung:', error)
    return null
  }
}

/**
 * Hört live auf den Aufruf. Gibt die Abmeldefunktion zurück.
 */
export function subscribeToOvertimeReminderBroadcast(
  onBroadcast: (broadcast: OvertimeReminderBroadcast | null) => void
): () => void {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  authReady
    .then(() => {
      if (cancelled) return
      unsubscribe = onSnapshot(
        doc(db, BROADCAST_DOC.collection, BROADCAST_DOC.id),
        snap => onBroadcast(snap.exists() ? toBroadcast(snap.data()) : null),
        error => console.warn('Überstunden-Erinnerung: Live-Verbindung fehlgeschlagen:', error)
      )
    })
    .catch(() => {})

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export interface TriggerBroadcastResult {
  /** Anzahl erreichter Geräte (Push) */
  sent: number
  failed: number
  /** Hinweis des Servers, z. B. wenn kein Gerät angemeldet ist */
  message?: string
}

/**
 * Löst die Erinnerung aus: Broadcast-Dokument schreiben (Popup in der App) und
 * Push an die angemeldeten Mitarbeiter-Geräte.
 *
 * Das Dokument wird zuerst geschrieben – das ist der Weg, der immer
 * funktioniert. Scheitert der Push danach, ist die App-Seite trotzdem versorgt.
 */
export async function triggerOvertimeReminderBroadcast(
  month: string,
  triggeredByName?: string
): Promise<TriggerBroadcastResult> {
  await authReady
  await setDoc(doc(db, BROADCAST_DOC.collection, BROADCAST_DOC.id), {
    month,
    triggeredAt: new Date(),
    triggeredByName: triggeredByName || null
  })

  try {
    // Monat und Beschriftung mitgeben: die Function soll keine eigenen
    // Monatsnamen führen müssen.
    const result = await postWithIdToken('/api/push/overtime-reminder', {
      month,
      monthLabel: monthKeyLabel(month)
    })
    return {
      sent: Number(result?.sent) || 0,
      failed: Number(result?.failed) || 0,
      message: typeof result?.message === 'string' ? result.message : undefined
    }
  } catch (error: any) {
    // Popup steht bereits – der Push ist der Zusatz, nicht die Hauptsache.
    return {
      sent: 0,
      failed: 0,
      message: `Popup ausgelöst, aber der Push ist fehlgeschlagen: ${error?.message || 'unbekannter Fehler'}`
    }
  }
}
