#!/usr/bin/env node
/**
 * End-to-End-Test der deployten Vercel-Endpunkte:
 *   GET  /api/hero/health          – Konfig/Verbindung
 *   POST /api/hero/sync/projects   – Projekt-Sync nach Firestore (nur mit --sync)
 *
 * Die Endpunkte verlangen einen Bearer-Token. Für den CLI-Test wird der
 * Service-Token verwendet (siehe api/hero/lib/auth.js): HERO_API_TOKEN
 * (oder ersatzweise PUSH_API_TOKEN). Beide müssen in Vercel hinterlegt sein.
 *
 * Nutzung:
 *   HERO_BASE_URL=https://deine-app.vercel.app \
 *   HERO_API_TOKEN=dein-service-token \
 *   node scripts/hero/test-hero-endpoints.mjs
 *
 * Sync zusätzlich auslösen (schreibt nach Firestore!):
 *   ... node scripts/hero/test-hero-endpoints.mjs --sync
 *
 * Lädt automatisch eine .env-Datei im Projekt-Root, falls vorhanden.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

function loadDotEnv() {
  for (const file of ['.env', '.env.local']) {
    try {
      const raw = readFileSync(resolve(ROOT, file), 'utf8')
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        if (process.env[m[1]] !== undefined) continue
        let val = m[2].trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        process.env[m[1]] = val
      }
    } catch {
      /* ignorieren */
    }
  }
}
loadDotEnv()

const BASE_URL = String(process.env.HERO_BASE_URL || '').trim().replace(/\/$/, '')
const TOKEN = String(process.env.HERO_API_TOKEN || process.env.PUSH_API_TOKEN || '').trim()
const RUN_SYNC = process.argv.includes('--sync')

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
}
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`)
const warn = (m) => console.log(`${c.yellow}⚠${c.reset} ${m}`)
const fail = (m) => console.log(`${c.red}✗${c.reset} ${m}`)
const head = (m) => console.log(`\n${c.cyan}${m}${c.reset}`)

async function callApi(path, method) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

async function main() {
  head('HERO Vercel-Endpunkt-Test')

  // Voraussetzungen
  if (!BASE_URL) {
    fail('HERO_BASE_URL ist nicht gesetzt (z. B. https://deine-app.vercel.app).')
    process.exit(1)
  }
  if (!TOKEN) {
    fail('Kein Service-Token: HERO_API_TOKEN oder PUSH_API_TOKEN setzen.')
    console.log(
      `${c.dim}  -> Dieser Token muss identisch in Vercel hinterlegt sein (api/hero/lib/auth.js).${c.reset}`
    )
    process.exit(1)
  }
  ok(`Base URL: ${BASE_URL}`)
  ok(`Service-Token gesetzt (…${TOKEN.slice(-4)})`)

  // 1) Health
  head('1) GET /api/hero/health')
  let health
  try {
    const { status, payload } = await callApi('/api/hero/health', 'GET')
    health = payload
    if (status === 401) {
      fail('401 Unauthorized – Token stimmt nicht mit der Vercel-Variable überein.')
      process.exit(2)
    }
    if (status !== 200) {
      fail(`Unerwarteter Status ${status}: ${JSON.stringify(payload)}`)
      process.exit(2)
    }
    ok('Endpunkt erreichbar (HTTP 200).')
    console.log(`  ${health.syncEnabled ? '✓' : '✗'} syncEnabled (HERO_SYNC_ENABLED): ${health.syncEnabled}`)
    console.log(`  ${health.hasApiKey ? '✓' : '✗'} hasApiKey (HERO_API_KEY): ${health.hasApiKey}`)
    console.log(`  ${health.apiReachable ? '✓' : '✗'} apiReachable (HERO GraphQL): ${health.apiReachable}`)
    console.log(`  ${c.dim}graphqlUrl: ${health.graphqlUrl}${c.reset}`)
    if (health.apiError) warn(`apiError: ${health.apiError}`)
  } catch (e) {
    fail(`Health-Aufruf fehlgeschlagen: ${e.message}`)
    process.exit(2)
  }

  // Bewertung Health
  if (!health.syncEnabled) warn('HERO_SYNC_ENABLED ist false – Sync ist deaktiviert.')
  if (!health.hasApiKey) fail('HERO_API_KEY fehlt in Vercel.')
  if (health.syncEnabled && health.hasApiKey && health.apiReachable) {
    ok('Server-Konfiguration vollständig und HERO erreichbar.')
  }

  // 2) Sync (optional)
  head('2) POST /api/hero/sync/projects')
  if (!RUN_SYNC) {
    console.log(`${c.dim}Übersprungen. Mit --sync ausführen, um den Projekt-Sync wirklich auszulösen.${c.reset}`)
  } else if (!health.syncEnabled || !health.hasApiKey) {
    warn('Sync nicht ausgelöst – Server ist nicht vollständig konfiguriert.')
  } else {
    try {
      const { status, payload } = await callApi('/api/hero/sync/projects', 'POST')
      if (status !== 200 || !payload.success) {
        fail(`Sync-Status ${status}: ${payload.error || JSON.stringify(payload)}`)
        process.exit(3)
      }
      const s = payload.stats || {}
      ok('Projekt-Sync erfolgreich.')
      console.log(
        `  total=${s.total ?? '?'}  neu=${s.created ?? '?'}  aktualisiert=${s.updated ?? '?'}` +
          `  archiviert=${s.archived ?? '?'}  übersprungen=${s.skipped ?? '?'}`
      )
    } catch (e) {
      fail(`Sync-Aufruf fehlgeschlagen: ${e.message}`)
      process.exit(3)
    }
  }

  head('Fertig')
}

main().catch((e) => {
  fail(`Unerwarteter Fehler: ${e?.message || e}`)
  process.exit(10)
})
