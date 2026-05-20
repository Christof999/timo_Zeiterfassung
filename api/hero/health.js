const { initFirebaseAdmin } = require('./lib/firebaseAdmin')
const { authorizeRequest } = require('./lib/auth')
const {
  isHeroSyncEnabled,
  getHeroApiKey,
  getHeroGraphqlUrl,
  DEFAULT_GRAPHQL_URL
} = require('./lib/heroConfig')
const { heroGraphqlRequest } = require('./lib/heroGraphql')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    initFirebaseAdmin()
    await authorizeRequest(req)

    const syncEnabled = isHeroSyncEnabled()
    const hasApiKey = !!getHeroApiKey()
    const graphqlUrl = getHeroGraphqlUrl()

    const result = {
      success: true,
      syncEnabled,
      hasApiKey,
      graphqlUrl,
      defaultGraphqlUrl: DEFAULT_GRAPHQL_URL,
      apiReachable: false,
      apiError: null
    }

    if (syncEnabled && hasApiKey) {
      try {
        await heroGraphqlRequest('query { __typename }')
        result.apiReachable = true
      } catch (error) {
        result.apiError = error?.message || 'HERO API nicht erreichbar'
      }
    } else if (!syncEnabled) {
      result.apiError = 'HERO_SYNC_ENABLED ist false'
    } else {
      result.apiError = 'HERO_API_KEY fehlt'
    }

    return res.status(200).json(result)
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    console.error('HERO health Fehler:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Interner Serverfehler'
    })
  }
}
