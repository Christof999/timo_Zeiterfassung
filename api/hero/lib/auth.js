const { getAuth } = require('firebase-admin/auth')

async function authorizeRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const bearerToken = authHeader.slice('Bearer '.length).trim()
  if (!bearerToken) {
    throw new Error('Unauthorized')
  }

  if (process.env.HERO_API_TOKEN && bearerToken === process.env.HERO_API_TOKEN) {
    return { uid: 'service-token' }
  }

  if (process.env.PUSH_API_TOKEN && bearerToken === process.env.PUSH_API_TOKEN) {
    return { uid: 'service-token' }
  }

  const decoded = await getAuth().verifyIdToken(bearerToken)
  return { uid: decoded.uid }
}

module.exports = { authorizeRequest }
