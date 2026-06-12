#!/usr/bin/env node
/*
 * hero-test.mjs  –  HERO-Schnelltest für die Zeiterfassungs-Übergabe.
 *
 * AUSFÜHREN (im Terminal, NICHT den Code in PowerShell einfügen!):
 *   node scripts/hero/hero-test.mjs
 *
 * Den Key entweder unten eintragen ODER als Umgebungsvariable übergeben:
 *   PowerShell:  $env:HERO_API_KEY="dein-key"; node scripts/hero/hero-test.mjs
 *   CMD:         set HERO_API_KEY=dein-key && node scripts/hero/hero-test.mjs
 *   macOS/Linux: HERO_API_KEY=dein-key node scripts/hero/hero-test.mjs
 */

// ───────────────────────────────────────────────────────────
//  Alternativ HIER den HERO-Key eintragen (in die Anführungszeichen):
const HERO_API_KEY = process.env.HERO_API_KEY || ''
const HERO_GRAPHQL_URL =
  process.env.HERO_GRAPHQL_URL || 'https://login.hero-software.de/api/external/v9/graphql'
// ───────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(HERO_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${HERO_API_KEY}`
    },
    body: JSON.stringify({ query, variables })
  })
  const text = await res.text()
  let p = null
  try {
    p = text ? JSON.parse(text) : null
  } catch {
    /* kein JSON */
  }
  if (!res.ok) throw new Error(p?.errors?.[0]?.message || p?.message || `HTTP ${res.status}`)
  if (p?.errors?.length) throw new Error(p.errors.map((e) => e.message).join('; '))
  return p?.data || {}
}

async function main() {
  if (!HERO_API_KEY) {
    console.error('✗ Kein HERO_API_KEY. Trage ihn oben im Skript ein oder setze die Umgebungsvariable.')
    process.exit(1)
  }
  console.log('Endpoint:', HERO_GRAPHQL_URL, '\n')

  // 1) Verbindung
  try {
    await gql('query { __typename }')
    console.log('✓ Verbindung OK, API-Key akzeptiert.\n')
  } catch (e) {
    console.error('✗ Verbindung fehlgeschlagen:', e.message)
    process.exit(2)
  }

  // 2) Welche Abfragen bietet HERO an? (Zeit/Personal/Projekt)
  try {
    const introspect = await gql('query { __schema { queryType { fields { name } } } }')
    const names = (introspect.__schema?.queryType?.fields || []).map((f) => f.name)
    console.log(`HERO stellt ${names.length} Abfragen bereit. Relevant für Zeit/Personal/Projekt:`)
    const relevant = names.filter((n) =>
      /time|zeit|hour|stunde|work|arbeit|employee|mitarbeit|staff|person|cost|kalkul|project|projekt/i.test(n)
    )
    console.log('  ' + (relevant.join(', ') || '(keine offensichtlichen gefunden)'))
    console.log()
  } catch (e) {
    console.log('ℹ Introspection nicht verfügbar:', e.message, '\n')
  }

  // 3) Projektdaten – Basis für die Zuordnung der Zeiterfassung
  const PROJECT_QUERY = `
    query {
      project_matches {
        id
        project_nr
        measure { short name }
        customer { id first_name last_name company_name email }
        contact { id first_name last_name }
        address { street city zipcode }
        current_project_match_status { status_code name }
      }
    }`
  let projects = []
  try {
    const data = await gql(PROJECT_QUERY)
    projects = Array.isArray(data.project_matches) ? data.project_matches : []
    console.log(`✓ ${projects.length} Projekt(e) erhalten.\n`)
  } catch (e) {
    console.error('✗ project_matches fehlgeschlagen:', e.message)
    process.exit(3)
  }

  if (projects.length > 0) {
    console.log('── Erstes Projekt, roh von HERO ──')
    console.log(JSON.stringify(projects[0], null, 2))
    console.log()
  }

  // 4) Feld-Check: das sind die Werte, die die Übergabe braucht
  const NEEDED = [
    ['id', 'PFLICHT – Schlüssel (→ projects.heroProjectId), Brücke für jede Zeitzuordnung'],
    ['project_nr', 'empfohlen – Projektnummer'],
    ['customer.company_name', 'optional – Kunde/Firma'],
    ['address.street', 'empfohlen – Standort'],
    ['address.zipcode', 'empfohlen'],
    ['address.city', 'empfohlen'],
    ['current_project_match_status.status_code', 'empfohlen – aktiv/archiviert'],
    ['current_project_match_status.name', 'empfohlen'],
    ['measure.name', 'optional – Gewerk']
  ]
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
  const empty = (v) => v == null || (typeof v === 'string' && v.trim() === '')

  console.log('── Benötigte Werte (über alle Projekte) ──')
  for (const [path, info] of NEEDED) {
    const miss = projects.filter((p) => empty(get(p, path))).length
    const mark = miss === 0 ? '✓' : info.startsWith('PFLICHT') ? '✗' : '⚠'
    console.log(`${mark} ${path.padEnd(42)} fehlt ${miss}/${projects.length}  – ${info}`)
  }
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(10)
})
