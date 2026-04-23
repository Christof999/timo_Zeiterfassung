import { initializeApp } from 'firebase/app'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'

// Firebase-Konfiguration aus Umgebungsvariablen (lokal: .env, Vercel: Environment Variables mit Prefix VITE_)
const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID ?? '').trim()
}

if (!firebaseConfig.apiKey) {
  const hint =
    'VITE_FIREBASE_API_KEY fehlt oder ist leer. Unter Vercel: Projekt → Settings → Environment Variables → alle VITE_FIREBASE_* aus der Firebase Console (Web-App) eintragen, dann Redeploy.'
  if (import.meta.env.PROD) {
    throw new Error(`Firebase: ${hint}`)
  }
  console.warn(`Firebase: ${hint}`)
}

const app = initializeApp(firebaseConfig)

// Explizites Long-Polling umgeht häufige WebChannel-/Proxy-Probleme (Safari, strenge Netze),
// die sonst als "Load failed" / abgebrochene Streams (DOMException) in der Konsole erscheinen.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
})
export const storage = getStorage(app)
export const auth = getAuth(app)

