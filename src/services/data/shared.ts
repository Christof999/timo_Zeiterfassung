import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { auth } from '../firebaseConfig'

export const isDevMode = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV

/** Regelarbeitszeit pro Tag (Basis für Überstunden und „Urlaub auf Überstunden"). */
export const REGULAR_DAY_MINUTES = 8.5 * 60

/**
 * Firebase-Auth-Bereitschaft: alle Firestore-Zugriffe warten auf dieses Promise.
 * Ohne angemeldeten Nutzer wird anonym angemeldet (siehe Firestore Security Rules).
 */
export const authReady: Promise<void> = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      resolve()
      unsubscribe()
    } else {
      signInAnonymously(auth).catch((error) => {
        console.error('❌ Fehler bei der anonymen Anmeldung:', error)
        if (error?.code === 'auth/configuration-not-found') {
          console.error(
            'Firebase Auth: Im Projekt Authentication aktivieren, Provider „Anonym“ einschalten und die Vercel-Domain unter Authentication → Settings → Authorized domains eintragen. Ohne gültige Anmeldung sind Firestore-Schreibzugriffe (Admin) gesperrt.'
          )
        }
        resolve() // Trotzdem auflösen, damit die App weiterläuft
      })
    }
  })
})

/** Robuste Umwandlung beliebiger Firestore-/JS-Datumswerte in ein Date. */
export function convertToDate(timestamp: unknown): Date {
  if (!timestamp) return new Date()

  if (timestamp instanceof Date) {
    return timestamp
  }

  if (timestamp instanceof Timestamp) {
    return timestamp.toDate()
  }

  const withToDate = timestamp as { toDate?: () => Date }
  if (withToDate.toDate && typeof withToDate.toDate === 'function') {
    return withToDate.toDate()
  }

  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    return new Date(timestamp)
  }

  const raw = timestamp as { seconds?: number; nanoseconds?: number }
  if (raw.seconds !== undefined) {
    return new Date(raw.seconds * 1000 + (raw.nanoseconds || 0) / 1000000)
  }

  return new Date()
}

/** POST an eine interne API-Route mit Firebase-ID-Token; wirft bei HTTP-Fehlern. */
/** Gibt die Antwort der Function zurück; Aufrufer ohne Interesse daran ignorieren sie. */
export async function postWithIdToken(
  path: string,
  body: unknown
): Promise<Record<string, unknown> | null> {
  const currentAuthUser = auth.currentUser
  if (!currentAuthUser) {
    throw new Error('Kein Firebase Auth User vorhanden')
  }
  const idToken = await currentAuthUser.getIdToken()

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    const errorMessage = errorPayload?.error || `HTTP ${response.status}`
    throw new Error(errorMessage)
  }

  return response.json().catch(() => null)
}
