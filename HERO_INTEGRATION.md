# HERO-Integration (Phase 1)

Vorbereitung der Anbindung an [HERO Handwerkersoftware](https://hero-software.de/api-doku). Zeit-Export zur Nachkalkulation folgt in Phase 2, sobald HERO die passende GraphQL-Mutation bestätigt hat.

## Server (Vercel)

| Variable | Beschreibung |
|----------|----------------|
| `HERO_API_KEY` | Bearer-Token von HERO Support |
| `HERO_SYNC_ENABLED` | `true` aktiviert Projekt-Sync und API-Calls |
| `HERO_GRAPHQL_URL` | Optional, Standard: `https://login.hero-software.de/api/external/v7/graphql` |
| `HERO_API_TOKEN` | Optional für maschinelle Aufrufe |

Zusätzlich die bestehenden Firebase-Admin-Variablen (`FIREBASE_*`) wie bei Push.

## API-Endpunkte

- `GET /api/hero/health` – Verbindungstest (Firebase ID Token im Header)
- `POST /api/hero/sync/projects` – Projekte aus HERO nach Firestore

## Firestore

- `integrations/hero` – letzter Sync-Status
- `heroSyncLogs` – Protokoll
- `projects.heroProjectId` – Zuordnung zu HERO `project_matches.id`
- `employees.heroEmployeeId` – Zuordnung für späteren Export
- `timeEntries.heroSyncStatus` – `pending` nach Ausstempeln (Export folgt)

## Admin

Tab **HERO** im Admin-Dashboard: Verbindung testen, Projekt-Sync, Mitarbeiter-IDs zuordnen.
