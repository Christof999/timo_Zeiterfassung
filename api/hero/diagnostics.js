/**
 * GET /api/hero/diagnostics
 *
 * Frontend-Test für die HERO-Anbindung – bewusst OHNE Firebase Admin, damit er
 * allein mit HERO_API_KEY (in Vercel) funktioniert. Gibt absichtlich KEINE
 * Kundendaten oder Secrets zurück: nur verfügbare HERO-Abfragen, die Feld-
 * Struktur (Typen statt Werte) und eine Pflichtfeld-Prüfung. Damit lässt sich
 * im Admin-UI prüfen, welche Werte HERO für die Zeiterfassungs-Übergabe liefert.
 */
const {
  isHeroSyncEnabled,
  getHeroApiKey,
  getHeroGraphqlUrl
} = require('../../lib/hero/heroConfig')
const { heroGraphqlRequest, fetchHeroProjectMatches } = require('../../lib/hero/heroGraphql')

// Beschreibt die Struktur eines Objekts mit Typen statt Werten (PII-sicher).
function describeShape(value, depth = 0) {
  if (value === null || value === undefined) return value === null ? 'null' : 'fehlt'
  if (Array.isArray(value)) {
    return value.length === 0 ? '[] (leer)' : [describeShape(value[0], depth + 1)]
  }
  if (typeof value === 'object') {
    if (depth > 4) return 'object'
    const out = {}
    for (const key of Object.keys(value)) {
      out[key] = describeShape(value[key], depth + 1)
    }
    return out
  }
  // Primitive: nur Typ + ob gefüllt, niemals den echten Wert
  if (typeof value === 'string') return value.trim() === '' ? 'string (leer)' : 'string ✓'
  return typeof value
}

// Felder, die der Projekt-/Zeit-Sync braucht (siehe lib/syncProjects.js).
const FIELD_SPEC = [
  { path: 'id', severity: 'required' },
  { path: 'project_nr', severity: 'recommended' },
  { path: 'customer.company_name', severity: 'optional' },
  { path: 'customer.first_name', severity: 'optional' },
  { path: 'customer.last_name', severity: 'optional' },
  { path: 'address.street', severity: 'recommended' },
  { path: 'address.zipcode', severity: 'recommended' },
  { path: 'address.city', severity: 'recommended' },
  { path: 'current_project_match_status.status_code', severity: 'recommended' },
  { path: 'current_project_match_status.name', severity: 'recommended' },
  { path: 'measure.name', severity: 'optional' },
  { path: 'measure.short', severity: 'optional' }
]

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}
function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

// Surrounding-Quotes entfernen (häufiger Vercel-Copy-Fehler).
function dequote(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}

// PII-sichere Analyse des Key-Werts (gibt NIE den Key selbst zurück).
function analyzeKey(raw) {
  const trimmed = raw.trim()
  const cleaned = dequote(trimmed)
  // Vorschau zum Abgleich mit der HERO-Erstellungsseite (erste 6 + letzte 2).
  const preview =
    cleaned.length > 12 ? `${cleaned.slice(0, 6)}…${cleaned.slice(-2)}` : '••••'
  // Versteckte / nicht-druckbare / Nicht-ASCII-Zeichen erkennen (z. B. ein aus
  // Copy&Paste eingeschlepptes Zero-Width-Space). Diese macht der Whitespace-Test
  // (\s) NICHT sichtbar, sie machen den Key bei HERO aber ungültig.
  const nonAscii = [...cleaned].filter((ch) => {
    const code = ch.codePointAt(0)
    return code < 0x20 || code > 0x7e
  })
  return {
    rawLength: raw.length,
    trimmedLength: trimmed.length,
    cleanedLength: cleaned.length,
    preview,
    hadSurroundingWhitespace: raw !== trimmed,
    hasSurroundingQuotes: cleaned !== trimmed,
    containsInnerWhitespace: /\s/.test(cleaned),
    nonAsciiCharCount: nonAscii.length,
    hasHiddenOrNonAsciiChars: nonAscii.length > 0,
    startsWithBearer: /^bearer\s/i.test(cleaned),
    looksLikeJwt: cleaned.split('.').length === 3
  }
}

// Rohanfrage mit beliebigen Auth-Headern; gibt Status/Fehler zurück, nie Daten.
async function probeRequest(url, headers) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify({ query: 'query { __typename }' })
    })
    const text = await res.text()
    let p = null
    try {
      p = text ? JSON.parse(text) : null
    } catch {
      /* kein JSON */
    }
    const errMsg = p?.errors?.[0]?.message || p?.message || (res.ok ? null : `HTTP ${res.status}`)
    return { status: res.status, ok: res.ok && !p?.errors?.length, error: errMsg }
  } catch (e) {
    return { status: 0, ok: false, error: e?.message || 'Netzwerkfehler' }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  const rawKey = String(process.env.HERO_API_KEY || '')
  const result = {
    success: true,
    syncEnabled: isHeroSyncEnabled(),
    hasApiKey: !!getHeroApiKey(),
    graphqlUrl: getHeroGraphqlUrl(),
    reachable: false,
    error: null,
    keyInfo: rawKey ? analyzeKey(rawKey) : null,
    authProbe: null,
    availableQueries: { relevant: [], all: [], total: 0 },
    typeShapes: null,
    nestedTypeShapes: null,
    projects: null
  }

  if (!result.hasApiKey) {
    result.error = 'HERO_API_KEY fehlt in den Vercel-Umgebungsvariablen.'
    return res.status(200).json(result)
  }

  // 1) Verbindung
  try {
    await heroGraphqlRequest('query { __typename }')
    result.reachable = true
  } catch (error) {
    result.error = error?.message || 'HERO API nicht erreichbar'
  }

  // 1b) Wenn Auth fehlschlägt: verschiedene Header-/Key-Varianten testen,
  //     um Format-Probleme (Quotes, „Bearer“ im Wert, falsches Schema) zu finden.
  if (!result.reachable) {
    const url = getHeroGraphqlUrl()
    const cleaned = dequote(rawKey.trim())
    const variants = [
      { scheme: 'Authorization: Bearer <key>', headers: { Authorization: `Bearer ${cleaned}` } },
      { scheme: 'Authorization: <key> (ohne Bearer)', headers: { Authorization: cleaned } },
      { scheme: 'Authorization: Token <key>', headers: { Authorization: `Token ${cleaned}` } },
      { scheme: 'X-Api-Key: <key>', headers: { 'X-Api-Key': cleaned } },
      { scheme: 'apikey: <key>', headers: { apikey: cleaned } }
    ]
    const probe = []
    for (const v of variants) {
      // eslint-disable-next-line no-await-in-loop
      const r = await probeRequest(url, v.headers)
      probe.push({ scheme: v.scheme, ...r })
    }
    result.authProbe = probe
    const working = probe.find((p) => p.ok)
    if (working) {
      result.error =
        `Auth-Format-Problem: HERO akzeptiert „${working.scheme}". ` +
        'Der Standard-Header schlägt fehl – siehe authProbe.'
    }
    return res.status(200).json(result)
  }

  // 2) Verfügbare Abfragen (Schema-Introspection) – nur Namen, keine Daten
  try {
    const data = await heroGraphqlRequest('query { __schema { queryType { fields { name } } } }')
    const names = (data.__schema?.queryType?.fields || []).map((f) => f.name)
    result.availableQueries.total = names.length
    result.availableQueries.all = [...names].sort((a, b) => a.localeCompare(b))
    result.availableQueries.relevant = names.filter((n) =>
      /time|zeit|hour|stunde|work|arbeit|employee|mitarbeit|staff|person|contact|kontakt|cost|kalkul|project|projekt|customer|kunde|client|article|artikel|material|product|produkt|item|position|document|dokument|offer|angebot|order|auftrag|quote|invoice|rechnung|measure|gewerk/i.test(
        n
      )
    )
  } catch (error) {
    result.availableQueries.error = error?.message || 'Introspection nicht verfügbar'
  }

  // 2b) Feld-Struktur der für Artikel/Kunden relevanten Queries ermitteln,
  //     damit der Import (z. B. Artikel → Materialliste) mit echten Feldnamen
  //     gebaut werden kann. Inkl. Query-Argumente und einer Ebene verschachtelter
  //     Objekt-Typen (z. B. base_data, sales_prices). Nur Schema-Namen.
  try {
    const unwrap = (typeRef) => {
      let t = typeRef
      while (t && !t.name && t.ofType) t = t.ofType
      return t || {}
    }
    const fmtFieldType = (typeRef) => {
      const t = unwrap(typeRef)
      return t.name ? `${t.name}${t.kind === 'OBJECT' ? ' (obj)' : ''}` : t.kind || '?'
    }
    const objTypeName = (typeRef) => {
      const t = unwrap(typeRef)
      return t.kind === 'OBJECT' ? t.name : null
    }

    const BASE_CANDIDATES = [
      'supply_product_versions',
      'new_supply_product_version',
      'contacts',
      'costcenters',
      'tracking_times',
      'tracking_times_categories'
    ]
    // Angebots-/Dokument-/Leistungs-Queries: bei HERO ist ein Angebot ein Dokument,
    // die Positionen referenzieren Produkte/Leistungen + Mengen.
    const OFFER_CANDIDATES = [
      'customer_documents',
      'document_types',
      'supply_services',
      'new_supply_service',
      'supply_texts',
      'receipts',
      'Receipt_Receipts'
    ]
    const allNames = result.availableQueries.all || []
    const docOfferRe = /document|dokument|offer|angebot|order|auftrag|position|quote|invoice|rechnung/i
    const dynamicCandidates = allNames.filter((n) => docOfferRe.test(n))
    const CANDIDATE_QUERIES = [
      ...new Set([...BASE_CANDIDATES, ...OFFER_CANDIDATES, ...dynamicCandidates])
    ].filter((n) => allNames.includes(n))
    // Verschachtelte Objekt-Typen für Artikel + Angebots-/Dokument-/Leistungs-Queries auflösen
    const DEEP_QUERIES = new Set([
      'supply_product_versions',
      'new_supply_product_version',
      ...OFFER_CANDIDATES,
      ...dynamicCandidates
    ])

    const introspectType = async (typeName) => {
      const typeData = await heroGraphqlRequest(
        `query Shape($n: String!) {
          __type(name: $n) {
            name
            fields { name type { kind name ofType { kind name ofType { kind name } } } }
          }
        }`,
        { n: typeName }
      )
      return (typeData.__type?.fields || []).map((f) => ({
        name: f.name,
        type: fmtFieldType(f.type),
        _objType: objTypeName(f.type)
      }))
    }

    // Schema-Felder laden – mit Fallback ohne args, falls HERO bei der größeren
    // Abfrage einen Fehler liefert.
    let queryFields = []
    try {
      const schemaData = await heroGraphqlRequest(
        `query {
          __schema {
            queryType {
              fields {
                name
                args { name type { kind name ofType { kind name ofType { kind name } } } }
                type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
              }
            }
          }
        }`
      )
      queryFields = schemaData.__schema?.queryType?.fields || []
    } catch (schemaErr) {
      const schemaData = await heroGraphqlRequest(
        `query {
          __schema {
            queryType {
              fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
            }
          }
        }`
      )
      queryFields = schemaData.__schema?.queryType?.fields || []
      result.introspectionNote = `args-Introspection fehlgeschlagen: ${schemaErr?.message || 'Fehler'}`
    }

    const typeShapes = {}
    const nestedTypeShapes = {}
    const seenTypes = new Set()
    const nestedToFetch = new Set()
    let typeBudget = 30

    for (const queryName of CANDIDATE_QUERIES) {
      const field = queryFields.find((f) => f.name === queryName)
      if (!field) continue
      const typeName = unwrap(field.type).name
      const args = (field.args || []).map((a) => ({ name: a.name, type: fmtFieldType(a.type) }))

      if (!typeName) {
        typeShapes[queryName] = { typeName: null, args, fields: null }
        continue
      }
      if (seenTypes.has(typeName)) {
        typeShapes[queryName] = { typeName, args, fields: 'siehe oben' }
        continue
      }
      seenTypes.add(typeName)
      if (typeBudget-- <= 0) {
        typeShapes[queryName] = { typeName, args, fields: 'übersprungen (Budget)' }
        continue
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const fields = await introspectType(typeName)
        typeShapes[queryName] = { typeName, args, fields: fields.map(({ name, type }) => ({ name, type })) }
        if (DEEP_QUERIES.has(queryName)) {
          for (const f of fields) {
            if (f._objType) nestedToFetch.add(f._objType)
          }
        }
      } catch (typeErr) {
        typeShapes[queryName] = { typeName, args, error: typeErr?.message || 'Introspection fehlgeschlagen' }
      }
    }

    // Eine Ebene verschachtelter Objekt-Typen auflösen (Name/Einheit/Preis-Details,
    // Angebots-Positionen mit Produkt-/Mengen-Bezug)
    for (const typeName of nestedToFetch) {
      if (typeBudget-- <= 0) break
      if (seenTypes.has(typeName)) continue
      seenTypes.add(typeName)
      try {
        // eslint-disable-next-line no-await-in-loop
        const fields = await introspectType(typeName)
        nestedTypeShapes[typeName] = fields.map(({ name, type }) => ({ name, type }))
      } catch (nestedErr) {
        nestedTypeShapes[typeName] = { error: nestedErr?.message || 'Introspection fehlgeschlagen' }
      }
    }

    // Gezielt tiefer liegende Positions-/Detail-Typen auflösen (Angebotszeilen):
    // customer_documents.metadata.positions → CustomerDocumentPosition.
    const EXTRA_TYPES = [
      'CustomerDocumentPosition',
      'CustomerDocumentMetadata',
      'Documents_SupplyServicePosition',
      'Documents_DocumentType'
    ]
    for (const typeName of EXTRA_TYPES) {
      if (typeBudget-- <= 0) break
      if (seenTypes.has(typeName)) continue
      seenTypes.add(typeName)
      try {
        // eslint-disable-next-line no-await-in-loop
        const fields = await introspectType(typeName)
        nestedTypeShapes[typeName] = fields.map(({ name, type }) => ({ name, type }))
      } catch (extraErr) {
        nestedTypeShapes[typeName] = { error: extraErr?.message || 'Introspection fehlgeschlagen' }
      }
    }

    result.typeShapes = typeShapes
    result.nestedTypeShapes = nestedTypeShapes
  } catch (error) {
    result.typeShapes = { error: error?.message || 'Typ-Introspection nicht verfügbar' }
  }

  // 3) Projektfelder prüfen
  try {
    const projects = await fetchHeroProjectMatches()
    const fieldCheck = FIELD_SPEC.map((spec) => ({
      path: spec.path,
      severity: spec.severity,
      missing: projects.filter((p) => isEmpty(getPath(p, spec.path))).length,
      total: projects.length
    }))
    result.projects = {
      count: projects.length,
      sampleShape: projects.length > 0 ? describeShape(projects[0]) : null,
      fieldCheck
    }
  } catch (error) {
    result.error = error?.message || 'project_matches konnte nicht geladen werden'
  }

  return res.status(200).json(result)
}
