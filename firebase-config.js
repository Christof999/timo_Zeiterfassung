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
  storageBucket: "lauffer-zeiterfassung.appspot.com",
  messagingSenderId: "REMOVED_SENDER_ID",
  appId: "1:REMOVED_SENDER_ID:web:c177aeac4f8c126ab41f0b"
};

// Firebase initialisieren
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Firestore für lokale Entwicklung optimieren
const db = firebase.firestore();

// Verbindungseinstellungen für bessere Stabilität
// TEMP: Vereinfachte Einstellungen für lokale Entwicklung
db.settings({
  merge: true,
  ignoreUndefinedProperties: true,
  // experimentalForceLongPolling deaktiviert für bessere Performance
});

// Storage mit Fehlerbehandlung
let storage = null;
try {
  storage = firebase.storage();
  console.log('✅ Firebase Storage initialisiert');
} catch (error) {
  console.error('❌ Firebase Storage Fehler:', error);
}
// Auth-Referenz nur erstellen, wenn das Auth-SDK geladen wurde
const auth = typeof firebase.auth === 'function' ? firebase.auth() : null;

// Merge-Option für Dokument-Aktualisierungen verwenden
// (bereits oben gesetzt)

// TEMP: Offline-Persistenz für lokale Entwicklung deaktivieren
console.log('⚠️ Offline-Persistenz für lokale Entwicklung deaktiviert');

/*
// Offline-Persistenz für bessere lokale Entwicklung
try {
  db.enablePersistence({ 
    synchronizeTabs: true,
    experimentalTabSynchronization: true
  })
    .then(() => {
      console.log('🔄 Firebase Offline-Persistenz aktiviert');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Offline-Persistenz: Multiple Tabs offen, verwende Memory-Modus');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Browser unterstützt keine Offline-Persistenz');
      } else {
        console.warn('⚠️ Offline-Persistenz Fehler:', err.message);
      }
    });
} catch (error) {
  console.warn('⚠️ Persistenz-Setup Fehler:', error.message);
}
*/

// Verbindungsstatus überwachen
db.enableNetwork().then(() => {
  console.log('🌐 Firestore-Netzwerk aktiviert');
}).catch((error) => {
  console.error('❌ Firestore-Netzwerk Fehler:', error);
});

// Zur Fehlersuche, kann in der Produktion entfernt werden
console.log('Firebase initialisiert:', firebase.app && firebase.app().name);
