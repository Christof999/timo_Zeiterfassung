# Firebase-Projekt **timozeiterfassung**

## Verbindung (lokal)

1. In der [Firebase Console](https://console.firebase.google.com/) das Projekt **timozeiterfassung** öffnen.
2. **Projekteinstellungen** → **Meine Apps** → Web-App anlegen (falls noch nicht geschehen) und die Konfiguration kopieren.
3. Im Projektroot: `cp .env.example .env` und alle `VITE_FIREBASE_*` sowie optional `VITE_PUSH_VAPID_PUBLIC_KEY` eintragen.

### Vercel

Unter **Project → Settings → Environment Variables** dieselben Namen wie in `.env.example` anlegen (**Prefix `VITE_` nicht weglassen**). Ohne `VITE_FIREBASE_API_KEY` schlägt der Build bzw. die Laufzeit mit `auth/invalid-api-key` fehl. Nach dem Anlegen **Redeploy** auslösen (bestehende Deployments lesen neue Variablen nicht automatisch nach).
4. **Authentication** → **Anonym** aktivieren (die App meldet Nutzer per `signInAnonymously` an).
5. **Firestore Database** anlegen (Modus **Production** ist ok, solange die Regeln aus diesem Repo deployed sind).
6. Regeln deployen (Firebase CLI installiert und eingeloggt):

   ```bash
   firebase deploy --only firestore:rules --project timozeiterfassung
   ```

## Firestore-Sammlungen („Tabellen“)

| Sammlung | Verwendung |
|----------|------------|
| **employees** | Mitarbeiter inkl. Login (`username`), optional `password`, `name`, Urlaub, `status`, `activeTimeEntryId`, `isAdmin`, … |
| **projects** | Baustellen/Projekte (`name`, `client`, `address`, `status`, `isActive`, …) |
| **timeEntries** | Stempelsätze (`employeeId`, `projectId`, `clockInTime`, `clockOutTime`, Pausen, Fotos/Dokument-Referenzen, …) |
| **fileUploads** | Hochgeladene Dateien (u. a. Base64 in `base64Data`, `projectId`, `employeeId`, optional `timeEntryId`) |
| **vehicles** | Fahrzeugstamm |
| **vehicleUsages** | Fahrzeugbuchungen pro Projekt/Mitarbeiter/Tag, optional `timeEntryId` |
| **leaveRequests** | Urlaubs-/Abwesenheitsanträge |
| **adminPushSubscriptions** | Web-Push-Abos für Admins (nur Server/API `api/push/*`) |

Es sind **keine zusätzlichen Composite-Indizes** nötig, solange die App nur die vorhandenen Abfragen nutzt (kein `orderBy` in Firestore).

## Storage

Dateien liegen primär als **Base64 in Firestore** (`fileUploads`). **Cloud Storage** muss für den aktuellen Client-Code nicht zwingend angelegt sein; `VITE_FIREBASE_STORAGE_BUCKET` muss aber exakt zur **Web-App-Konfiguration** in der Console passen (je nach Projekt `…appspot.com` oder `…firebasestorage.app`).

## Push (optional)

Serverlose Endpoints unter `api/push/` brauchen **Firebase Admin** (`FIREBASE_*`) und **VAPID**-Schlüssel – siehe `.env.example`.
