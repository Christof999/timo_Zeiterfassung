import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "REMOVED_API_KEY",
  authDomain: "lauffer-zeiterfassung.firebaseapp.com",
  projectId: "lauffer-zeiterfassung",
  storageBucket: "lauffer-zeiterfassung.appspot.com",
  messagingSenderId: "REMOVED_SENDER_ID",
  appId: "1:REMOVED_SENDER_ID:web:c177aeac4f8c126ab41f0b"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const auth = getAuth(app)

