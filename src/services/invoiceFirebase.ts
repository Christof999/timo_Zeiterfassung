import { initializeApp } from 'firebase/app'
import { initializeFirestore, type Firestore } from 'firebase/firestore'
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth'

/**
 * Zweite Firebase-Verbindung: die Datenbank des Rechnungsprogramms.
 *
 * Dort liegt der Kundenstamm, der für beide Programme gilt. Die Zeiterfassung
 * liest ihn nur – angelegt und gepflegt werden Kunden im Rechnungsprogramm.
 * Das Gegenstück dort heißt `timeTrackingFirebase.ts` und greift umgekehrt auf
 * die Zeiterfassung zu.
 */
const invoiceFirebaseConfig = {
  apiKey: String(import.meta.env.VITE_INVOICE_FIREBASE_API_KEY ?? '').trim(),
  authDomain: String(import.meta.env.VITE_INVOICE_FIREBASE_AUTH_DOMAIN ?? '').trim(),
  projectId: String(import.meta.env.VITE_INVOICE_FIREBASE_PROJECT_ID ?? '').trim(),
  storageBucket: String(import.meta.env.VITE_INVOICE_FIREBASE_STORAGE_BUCKET ?? '').trim(),
  messagingSenderId: String(import.meta.env.VITE_INVOICE_FIREBASE_MESSAGING_SENDER_ID ?? '').trim(),
  appId: String(import.meta.env.VITE_INVOICE_FIREBASE_APP_ID ?? '').trim()
}

let invoiceDb: Firestore | null = null
let invoiceAuth: Auth | null = null

// Zum Lesen reichen API-Key und Projekt; die übrigen Werte sind Beiwerk.
if (invoiceFirebaseConfig.apiKey && invoiceFirebaseConfig.projectId) {
  try {
    const invoiceApp = initializeApp(invoiceFirebaseConfig, 'invoice')
    // Long-Polling wie bei der Hauptverbindung (siehe firebaseConfig.ts).
    invoiceDb = initializeFirestore(invoiceApp, { experimentalForceLongPolling: true })
    invoiceAuth = getAuth(invoiceApp)
  } catch (error) {
    // Nicht werfen: ohne Kundenstamm läuft die Zeiterfassung trotzdem weiter.
    console.error('Rechnungsprogramm-Firebase konnte nicht initialisiert werden:', error)
  }
} else {
  console.warn(
    'Rechnungsprogramm-Firebase nicht konfiguriert (VITE_INVOICE_FIREBASE_*) – ' +
      'der Kundenstamm des Rechnungsprogramms steht nicht zur Verfügung.'
  )
}

export const invoiceDbInstance = invoiceDb

/** True, wenn die Verbindung zum Rechnungsprogramm eingerichtet ist. */
export const isInvoiceFirebaseConfigured = invoiceDb !== null

/**
 * Meldet sich anonym am Rechnungsprogramm an. Best effort: ist der Anbieter
 * „Anonym“ dort nicht aktiv, bleibt die Verbindung unangemeldet – das Lesen
 * klappt dann nur, solange die dortigen Firestore-Regeln es ohne Anmeldung
 * erlauben.
 */
export const invoiceAuthReady: Promise<void> = (async () => {
  if (!invoiceAuth || invoiceAuth.currentUser) return
  try {
    await signInAnonymously(invoiceAuth)
  } catch (error) {
    console.warn('Rechnungsprogramm-Firebase: anonyme Anmeldung fehlgeschlagen:', error)
  }
})()
