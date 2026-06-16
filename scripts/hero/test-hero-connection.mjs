#!/usr/bin/env node
/**
 * Direkter HERO-GraphQL-Verbindungstest + Feld-Validierung.
 *
 * Prüft, ob der HERO_API_KEY gültig ist, die GraphQL-API erreichbar ist und ob
 * `project_matches` alle Felder liefert, die der Projekt-Sync
 * (lib/hero/syncProjects.js) braucht. Läuft komplett ohne Firebase.
 *
 * Nutzung:
 *   HERO_API_KEY=xxxx node scripts/hero/test-hero-connection.mjs
 *
 * Optional:
 *   HERO_GRAPHQL_URL   abweichende Endpoint-URL
 *                      (Standard: https://login.hero-software.de/api/external/v7/graphql)
 *   HERO_MAX_PROJECTS  wie viele Projekte detailliert validiert werden (Standard: 5)
 *
 * Lädt automatisch eine .env-Datei im Projekt-Root, falls vorhanden.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

// --- .env minimal laden (nur falls vorhanden, ohne Abhängigkeit) -----------
function loadDotEnv() {
  for (const file of ['.env', '.env.local']) {
    try {
      const raw = readFileSync(resolve(ROOT, file), 'utf8')
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        const key = m[1]
        if (process.env[key] !== undefined) continue
        let val = m[2].trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        process.env[key] = val
      }
    } catch {
      /* Datei fehlt – ignorieren */
    }
  }
}
loadDotEnv()

const DEFAULT_GRAPHQL_URL =
  'https://login.hero-software.de/api/external/v7/graphql'

const API_KEY = String(process.env.HERO_API_KEY || '').trim()
const GRAPHQL_URL = String(process.env.HERO_GRAPHQL_URL || DEFAULT_GRAPHQL_URL).trim()
const MAX_PROJECTS = Number(process.env.HERO_MAX_PROJECTS || 5)

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

async function heroGraphql(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ query, variables })
  })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.message ||
      `HERO GraphQL HTTP ${response.status}`
    const err = new Error(message)
    err.statusCode = response.status
    throw err
  }
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join('; '))
  }
  return payload?.data || {}
}

// Gleiche Abfrage wie lib/hero/heroGraphql.js
const PROJECT_MATCHES_QUERY = `
  query HeroProjectMatches {
    project_matches {
      id
      project_nr
      measure { short name }
      customer { id first_name last_name company_name email }
      contact { id first_name last_name }
      address { street city zipcode }
      current_project_match_status { status_code name }
    }
  }
`

/**
 * Feld-Spezifikation. severity:
 *   required    -> ohne dieses Feld ist der Datensatz für den Sync unbrauchbar
 *   recommended -> wird im Sync genutzt (Name/Adresse/Status), sollte vorhanden sein
 *   optional    -> nice to have
 */
const FIELD_SPEC = [
  { path: 'id', severity: 'required', note: 'Schlüssel für heroProjectId-Zuordnung' },
  { path: 'project_nr', severity: 'recommended', note: 'Projektnummer für Anzeigename' },
  { path: 'customer', severity: 'recommended', note: 'Kunde (Name/Firma)' },
  { path: 'customer.company_name', severity: 'optional' },
  { path: 'customer.first_name', severity: 'optional' },
  { path: 'customer.last_name', severity: 'optional' },
  { path: 'customer.email', severity: 'optional' },
  { path: 'measure.name', severity: 'optional', note: 'Gewerk -> Beschreibung' },
  { path: 'measure.short', severity: 'optional' },
  { path: 'address.street', severity: 'recommended', note: 'Adresse/Standort' },
  { path: 'address.zipcode', severity: 'recommended' },
  { path: 'address.city', severity: 'recommended' },
  { path: 'current_project_match_status.status_code', severity: 'recommended', note: 'Status-Mapping' },
  { path: 'current_project_match_status.name', severity: 'recommended', note: 'aktiv/archiviert' }
]

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}
function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

async function main() {
  head('HERO-Verbindungstest')
  console.log(`${c.dim}Endpoint:${c.reset} ${GRAPHQL_URL}`)

  // 1) Konfiguration prüfen
  head('1) Konfiguration')
  if (!API_KEY) {
    fail('HERO_API_KEY ist nicht gesetzt.')
    console.log(
      `${c.dim}  -> Setze ihn als Umgebungsvariable oder in .env:` +
        ` HERO_API_KEY=... node scripts/hero/test-hero-connection.mjs${c.reset}`
    )
    process.exit(1)
  }
  ok(`HERO_API_KEY gesetzt (${API_KEY.length} Zeichen, endet auf …${API_KEY.slice(-4)})`)
  ok(`HERO_GRAPHQL_URL: ${GRAPHQL_URL}`)

  // 2) Erreichbarkeit / Auth
  head('2) Verbindung & Authentifizierung')
  try {
    await heroGraphql('query { __typename }')
    ok('GraphQL erreichbar und API-Key akzeptiert.')
  } catch (e) {
    fail(`Verbindung fehlgeschlagen: ${e.message}`)
    if (e.statusCode === 401 || e.statusCode === 403) {
      console.log(`${c.dim}  -> API-Key ungültig oder ohne Berechtigung. Bei HERO Support prüfen.${c.reset}`)
    }
    process.exit(2)
  }

  // 3) project_matches laden
  head('3) Projektdaten laden (project_matches)')
  let projects = []
  try {
    const data = await heroGraphql(PROJECT_MATCHES_QUERY)
    projects = Array.isArray(data.project_matches) ? data.project_matches : []
    ok(`${projects.length} Projekt(e) von HERO erhalten.`)
  } catch (e) {
    fail(`project_matches konnte nicht geladen werden: ${e.message}`)
    process.exit(3)
  }
  if (projects.length === 0) {
    warn('Keine Projekte vorhanden – Feld-Validierung übersprungen.')
    process.exit(0)
  }

  // 4) Feld-Validierung
  head('4) Feld-Validierung')
  const missingCount = Object.create(null) // path -> Anzahl Datensätze ohne Wert
  let hardFail = 0

  projects.forEach((p) => {
    FIELD_SPEC.forEach((spec) => {
      if (isEmpty(getPath(p, spec.path))) {
        missingCount[spec.path] = (missingCount[spec.path] || 0) + 1
        if (spec.severity === 'required') hardFail += 1
      }
    })
  })

  const sample = projects.slice(0, Math.max(0, MAX_PROJECTS))
  console.log(`${c.dim}Stichprobe der ersten ${sample.length} von ${projects.length} Projekten:${c.reset}`)
  sample.forEach((p, i) => {
    const id = p?.id ?? '—'
    const nr = p?.project_nr ?? '—'
    const status = p?.current_project_match_status?.name ?? '—'
    console.log(`  ${i + 1}. id=${id}  nr=${nr}  status=${status}`)
  })

  console.log('\nFeld-Übersicht (über alle Projekte):')
  for (const spec of FIELD_SPEC) {
    const miss = missingCount[spec.path] || 0
    const label = `${spec.path}${spec.note ? `  ${c.dim}(${spec.note})${c.reset}` : ''}`
    if (miss === 0) {
      ok(`${spec.path} – vollständig`)
    } else if (spec.severity === 'required') {
      fail(`${label} – fehlt in ${miss}/${projects.length} Datensätzen [REQUIRED]`)
    } else if (spec.severity === 'recommended') {
      warn(`${label} – fehlt in ${miss}/${projects.length} Datensätzen [empfohlen]`)
    } else {
      console.log(`${c.dim}  ·${c.reset} ${label} – fehlt in ${miss}/${projects.length} [optional]`)
    }
  }

  // 5) Ergebnis
  head('Ergebnis')
  if (hardFail > 0) {
    fail(`${hardFail} fehlende Pflichtfeld-Werte. Sync würde unvollständige Projekte erzeugen.`)
    process.exit(4)
  }
  ok('Alle Pflichtfelder vorhanden. Verbindung & Daten sind sync-bereit.')
}

main().catch((e) => {
  fail(`Unerwarteter Fehler: ${e?.message || e}`)
  process.exit(10)
})
