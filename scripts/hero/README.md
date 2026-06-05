# HERO – Test- & Validierungs-Skripte

Zwei eigenständige Node-Skripte (kein zusätzliches npm-Paket nötig, Node ≥ 18).
Beide laden automatisch eine `.env` / `.env.local` im Projekt-Root.

## Umgebungsvariablen (Server / Vercel)

| Variable | Zweck | Pflicht |
|----------|-------|---------|
| `HERO_API_KEY` | Bearer-Token von HERO Support – **der Key, den du jetzt hast** | ja |
| `HERO_SYNC_ENABLED` | `true` aktiviert Sync & API-Calls | ja (für echten Betrieb) |
| `HERO_GRAPHQL_URL` | Endpoint, Standard `https://login.hero-software.de/api/external/v7/graphql` | nein |
| `HERO_API_TOKEN` | Service-Token für maschinelle Aufrufe der eigenen `/api/hero/*`-Endpunkte | nur für Endpunkt-Test |

> ⚠️ `HERO_API_KEY` **niemals** mit `VITE_`-Prefix anlegen – sonst landet er im
> Browser-Bundle. In Vercel als normale (server-seitige) Environment Variable
> hinterlegen.

## 1. Direkter HERO-Test + Feld-Validierung

Prüft API-Key, Erreichbarkeit und ob `project_matches` alle vom Sync benötigten
Felder liefert. Braucht **kein** Firebase.

```bash
HERO_API_KEY=dein-key node scripts/hero/test-hero-connection.mjs
```

Validiert: `id` (Pflicht), `project_nr`, `customer.*`, `address.*`,
`current_project_match_status.*`, `measure.*`. Meldet pro Feld, in wie vielen
Datensätzen ein Wert fehlt.

## 2. End-to-End-Test der Vercel-Endpunkte

Testet die deployten Endpunkte `GET /api/hero/health` und (mit `--sync`)
`POST /api/hero/sync/projects`.

```bash
HERO_BASE_URL=https://deine-app.vercel.app \
HERO_API_TOKEN=dein-service-token \
node scripts/hero/test-hero-endpoints.mjs

# Sync wirklich auslösen (schreibt nach Firestore):
... node scripts/hero/test-hero-endpoints.mjs --sync
```

## Empfohlene Reihenfolge

1. `test-hero-connection.mjs` lokal → bestätigt Key & Felder direkt bei HERO.
2. `HERO_*`-Variablen in Vercel hinterlegen, neu deployen.
3. `test-hero-endpoints.mjs` → bestätigt, dass Vercel die Variablen sieht und
   die Pipeline bis Firestore funktioniert.
