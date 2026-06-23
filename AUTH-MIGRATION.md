# Umstellung auf echte Firebase-Auth (Username-Login, admin-verwaltete Passwörter)

Diese Anleitung führt von der bisherigen (unsicheren) Klartext-Anmeldung auf
echte Firebase Authentication um – **ohne** dass jemand ausgesperrt wird.
Login bleibt „Username + Passwort"; der Admin verwaltet Passwörter weiter.

> Wichtig: In **Phasen** vorgehen. Nach jeder Phase testen, bevor die nächste
> kommt. Erst die letzte Phase verschärft die Security-Rules.

## Voraussetzungen (einmalig)
1. Firebase-Projekt auf **Blaze-Plan** (Functions/Storage brauchen das).
2. In der Firebase Console → **Authentication → Sign-in method**:
   - Provider **„E-Mail/Passwort"** aktivieren.
   - Provider **„Anonym"** **deaktivieren** (wird nicht mehr genutzt).
   - Unter **Settings → Authorized domains** die Vercel-Domain eintragen.
3. Firebase CLI lokal: `npm i -g firebase-tools` und `firebase login`.
4. Im Ordner `functions/` einmalig `npm install`.

## Phase 1 – Functions deployen & Bestandsnutzer migrieren (kein Nutzer-Impact)
Die App läuft in dieser Phase noch unverändert (alter Login). Wir legen nur die
Firebase-Auth-Nutzer für die bestehenden Mitarbeiter an.

1. Setup-Secret setzen (schützt die einmalige Migration):
   ```
   firebase functions:secrets:set SETUP_SECRET
   ```
   (einen beliebigen, geheimen Wert eingeben)
2. Functions deployen:
   ```
   firebase deploy --only functions
   ```
3. Migration **einmal** auslösen. Am einfachsten in der Web-App-Konsole
   (eingeloggt egal), Browser-DevTools → Console:
   ```js
   const { getFunctions, httpsCallable } = await import('firebase/functions')
   // ODER über ein kleines Hilfsskript mit dem Firebase-Web-SDK:
   const fn = httpsCallable(getFunctions(), 'migrateExistingEmployees')
   const res = await fn({ secret: '<DEIN_SETUP_SECRET>' })
   console.log(res.data) // { created, skipped, failed }
   ```
   Ergebnis prüfen: `created` = neu angelegte Auth-Nutzer, `failed` sollte 0 sein.
   - Für jeden Mitarbeiter wird ein Auth-Nutzer mit **uid = bisheriger
     Dokument-ID** angelegt → alle Verweise (`timeEntries.employeeId` etc.)
     bleiben gültig, **keine** Datenmigration nötig.
   - Mitarbeiter mit `isAdmin: true` bekommen automatisch den Admin-Claim.

## Phase 2 – Frontend mit Firebase-Login ausrollen (Rules noch offen)
Jetzt das neue Frontend deployen (dieser Branch). Der Login nutzt ab sofort
Firebase Auth. Die Security-Rules sind in diesem Schritt **noch** die alten
(offenen), damit garantiert niemand wegen Rules ausgesperrt wird.

1. Frontend deployen (Vercel) bzw. testen.
2. **Mit mehreren Konten testen**: ein normaler Mitarbeiter + ein Admin.
   - Ein-/Ausstempeln, Fotos, Material, Urlaub.
   - Admin-Dashboard, Mitarbeiter anlegen, Passwort zurücksetzen.
3. Neue Mitarbeiter/Passwörter laufen ab jetzt über die Functions
   (`adminCreateEmployee`, `adminSetPassword`).

> Hinweis: Solange hier getestet wird, bleiben in `firestore.rules` die alten
> offenen Regeln deployt. Erst Phase 3 spielt die verschärften Regeln ein.

## Phase 3 – Security-Rules verschärfen (der eigentliche Schutz)
Wenn Login & alle Flows laufen, die gehärteten Regeln deployen:
```
firebase deploy --only firestore:rules,storage
```
Was sich ändert:
- **Löhne/Mitarbeiterdaten** nur für Admin oder die Person selbst lesbar.
- Schreiben auf Stammdaten (Projekte, Material, Fahrzeuge, Kunden) nur Admin.
- Eigene Zeiteinträge schreiben nur als die jeweilige Person; Admin alles.
- Storage: öffentliches Lesen geschlossen (nur angemeldet).

**Direkt nach dem Deploy testen** (Mitarbeiter + Admin). Falls etwas klemmt,
sofort zurückrollen (siehe unten), Ursache fixen, erneut deployen.

### Not-Rollback der Rules (sperrt nichts aus, aber wieder „offen")
`firestore.rules` temporär ersetzen durch:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if request.auth != null; }
  }
}
```
und `firebase deploy --only firestore:rules`.

## Nach erfolgreicher Migration (Aufräumen)
- `password`-Felder aus der `employees`-Collection entfernen (sie werden nicht
  mehr genutzt; Passwörter liegen sicher in Firebase Auth).
- Die Function `migrateExistingEmployees` entfernen oder das `SETUP_SECRET`
  rotieren, damit die Migration nicht erneut auslösbar ist.

## Wichtige Hinweise
- **`AUTH_EMAIL_DOMAIN`** muss in `functions/index.js` und
  `src/utils/authIdentity.ts` identisch sein (aktuell
  `mitarbeiter.zeiterfassung-intern.de`). Die Domain muss **nicht** echt sein.
- Passwörter brauchen **mind. 6 Zeichen** (Firebase-Vorgabe). Bei der Migration
  müssen bestehende Klartext-Passwörter diese Länge erfüllen – sonst schlägt der
  betreffende Eintrag fehl (`failed`) und das Passwort muss neu gesetzt werden.
- Functions-Region: Standard `us-central1`. Bei anderer Region in
  `src/services/firebaseConfig.ts` `getFunctions(app, '<region>')` setzen.
- Budget-Alarm in Firebase setzen (z. B. 20 €), siehe Kosteneinschätzung.
