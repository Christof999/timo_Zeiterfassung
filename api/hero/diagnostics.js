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
} = require('./lib/heroConfig')
const { heroGraphqlRequest, fetchHeroProjectMatches } = require('./lib/heroGraphql')

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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  const result = {
    success: true,
    syncEnabled: isHeroSyncEnabled(),
    hasApiKey: !!getHeroApiKey(),
    graphqlUrl: getHeroGraphqlUrl(),
    reachable: false,
    error: null,
    availableQueries: { relevant: [], total: 0 },
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
    return res.status(200).json(result)
  }

  // 2) Verfügbare Abfragen (Schema-Introspection) – nur Namen, keine Daten
  try {
    const data = await heroGraphqlRequest('query { __schema { queryType { fields { name } } } }')
    const names = (data.__schema?.queryType?.fields || []).map((f) => f.name)
    result.availableQueries.total = names.length
    result.availableQueries.relevant = names.filter((n) =>
      /time|zeit|hour|stunde|work|arbeit|employee|mitarbeit|staff|person|contact|kontakt|cost|kalkul|project|projekt/i.test(
        n
      )
    )
  } catch (error) {
    result.availableQueries.error = error?.message || 'Introspection nicht verfügbar'
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
