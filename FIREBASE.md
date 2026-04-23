# Firebase-Projekt **timozeiterfassung**

## Verbindung (lokal)

1. In der [Firebase Console](https://console.firebase.google.com/) das Projekt **timozeiterfassung** öffnen.
2. **Projekteinstellungen** → **Meine Apps** → Web-App anlegen (falls noch nicht geschehen) und die Konfiguration kopieren.
3. Im Projektroot: `cp .env.example .env` und alle `VITE_FIREBASE_*` sowie optional `VITE_PUSH_VAPID_PUBLIC_KEY` eintragen.

### Vercel

Unter **Project → Settings → Environment Variables** dieselben Namen wie in `.env.example` anlegen (**Prefix `VITE_` nicht weglassen**). Ohne `VITE_FIREBASE_API_KEY` schlägt der Build bzw. die Laufzeit mit `auth/invalid-api-key` fehl. Nach dem Anlegen **Redeploy** auslösen (bestehende Deployments lesen neue Variablen nicht automatisch nach).
4. **Authentication** (links unter **Build**): Einmal **„Authentication aktivieren“ / Get started“** ausführen, bis die Methode **Anonym** sichtbar ist.
5. **Authentication** → Tab **Sign-in method** → **Anonym** → **Aktivieren** (die App ruft `signInAnonymously` auf – ohne diesen Provider schlägt die Anmeldung fehl und **Firestore-Schreibzugriffe** sind gesperrt, siehe Regeln unten).
6. **Authentication** → Tab **Settings** → **Authorized domains**: Deine **Vercel-Domain** hinzufügen (z. B. `dein-projekt.vercel.app` und ggf. jede **Preview-URL** wie `…-christof999s-projects.vercel.app`). Ohne Eintrag kann die Web-App auf der Domain nicht korrekt mit Auth sprechen.
7. **Firestore Database** anlegen (Modus **Production** ist ok, solange die Regeln aus diesem Repo deployed sind).
8. Regeln deployen (Firebase CLI installiert und eingeloggt):

   ```bash
   firebase deploy --only firestore:rules --project timozeiterfassung
   ```

## Fehlerbehebung

### `auth/configuration-not-found`

- **Authentication** wurde im Projekt noch nicht gestartet **oder** der Provider **Anonym** ist nicht aktiv (siehe Schritte 4–5).
- Prüfen, ob die `VITE_FIREBASE_*`-Variablen auf Vercel **wirklich zu diesem Firebase-Projekt** gehören (kein Tippfehler bei `projectId` / falscher API-Key von einem anderen Projekt).

### Admin: nichts lässt sich speichern / „Load failed“ / `DOMException`

Typische Kette: **anonyme Anmeldung fehlgeschlagen** → `request.auth` ist leer → Regeln in `firestore.rules` erlauben Schreiben nur mit `request.auth != null` → alle `setDoc`/`addDoc` schlagen fehl.

1. Oben **Anonym** + **Authorized domains** korrigieren, Seite neu laden (Hard-Reload).
2. In der **Browser-Konsole** prüfen, ob **`Firebase Auth bereit`** erscheint (ohne rotes ❌ davor).
3. In der Firebase Console unter **Firestore** → **Regeln** prüfen, ob deployed ist, was Schreiben für angemeldete Nutzer erlaubt (siehe `firestore.rules` im Repo).

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
