const DEFAULT_GRAPHQL_URL = 'https://login.hero-software.de/api/external/v7/graphql'

function isHeroSyncEnabled() {
  const raw = String(process.env.HERO_SYNC_ENABLED || 'false').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function getHeroApiKey() {
  return String(process.env.HERO_API_KEY || '').trim()
}

function getHeroGraphqlUrl() {
  return String(process.env.HERO_GRAPHQL_URL || DEFAULT_GRAPHQL_URL).trim()
}

function assertHeroConfigured() {
  if (!isHeroSyncEnabled()) {
    const error = new Error('HERO-Sync ist deaktiviert (HERO_SYNC_ENABLED=false).')
    error.code = 'HERO_SYNC_DISABLED'
    throw error
  }
  const apiKey = getHeroApiKey()
  if (!apiKey) {
    const error = new Error('HERO_API_KEY fehlt in den Server-Umgebungsvariablen.')
    error.code = 'HERO_API_KEY_MISSING'
    throw error
  }
  return apiKey
}

module.exports = {
  DEFAULT_GRAPHQL_URL,
  isHeroSyncEnabled,
  getHeroApiKey,
  getHeroGraphqlUrl,
  assertHeroConfigured
}
