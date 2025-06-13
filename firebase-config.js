/**
 * Firebase-Konfiguration für die Lauffer Zeiterfassung App
 * 
 * Diese Datei verwendet die einfachere CDN-basierte Version von Firebase.
 * Die Firebase-SDK-Skripte müssen in den HTML-Dateien vor dieser Datei geladen werden.
 */

// Firebase-Konfiguration
const firebaseConfig = {
  apiKey: "REMOVED_API_KEY",
  authDomain: "lauffer-zeiterfassung.firebaseapp.com",
  projectId: "lauffer-zeiterfassung",
  storageBucket: "lauffer-zeiterfassung.firebasestorage.app",
  messagingSenderId: "REMOVED_SENDER_ID",
  appId: "1:REMOVED_SENDER_ID:web:c177aeac4f8c126ab41f0b"
};

// Firebase initialisieren
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Referenzen zu Firebase-Diensten
const db = firebase.firestore();
const storage = firebase.storage();
// Auth-Referenz nur erstellen, wenn das Auth-SDK geladen wurde
const auth = typeof firebase.auth === 'function' ? firebase.auth() : null;

// Timestamps aktivieren und merge:true verwenden, um Warnung zu vermeiden
db.settings({
  timestampsInSnapshots: true,
  merge: true
});

// Zur Fehlersuche, kann in der Produktion entfernt werden
console.log('Firebase initialisiert:', firebase.app && firebase.app().name);
