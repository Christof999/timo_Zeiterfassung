const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')

const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
]

function assertEnv() {
  const missing = requiredEnv.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`)
  }
}

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return
  }

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  })
}

function createPushSubscriptionDocId(endpoint) {
  return `sub_${Buffer.from(endpoint).toString('base64').replace(/[+/=]/g, '').slice(0, 120)}`
}

async function authorizeRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const bearerToken = authHeader.slice('Bearer '.length).trim()
  if (!bearerToken) {
    throw new Error('Unauthorized')
  }

  // Optionaler Service-Token (z. B. fuer serverseitige Trigger ohne User-Token)
  if (process.env.PUSH_API_TOKEN && bearerToken === process.env.PUSH_API_TOKEN) {
    return { uid: 'service-token' }
  }

  const decoded = await getAuth().verifyIdToken(bearerToken)
  return { uid: decoded.uid }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    assertEnv()
    initFirebaseAdmin()
    const requester = await authorizeRequest(req)
    const payload = req.body || {}
    const action = payload.action
    const db = getFirestore()

    if (action === 'upsert') {
      const subscription = payload.subscription || {}
      if (!subscription.endpoint) {
        return res.status(400).json({ success: false, error: 'subscription.endpoint fehlt' })
      }

      const subscriptionId = createPushSubscriptionDocId(subscription.endpoint)
      await db.collection('adminPushSubscriptions').doc(subscriptionId).set(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys || {},
          expirationTime: subscription.expirationTime ?? null,
          active: true,
          adminId: payload.admin?.id || null,
          adminUsername: payload.admin?.username || null,
          adminName: payload.admin?.name || null,
          permission: payload.permission || null,
          isStandalone: !!payload.isStandalone,
          userAgent: payload.userAgent || null,
          updatedByUid: requester.uid,
          updatedAt: new Date(),
          lastSeenAt: new Date()
        },
        { merge: true }
      )

      return res.status(200).json({ success: true, id: subscriptionId })
    }

    if (action === 'disable') {
      const endpoint = payload.endpoint
      if (!endpoint) {
        return res.status(400).json({ success: false, error: 'endpoint fehlt' })
      }

      const subscriptionId = createPushSubscriptionDocId(endpoint)
      await db.collection('adminPushSubscriptions').doc(subscriptionId).set(
        {
          active: false,
          disabledAt: new Date(),
          updatedByUid: requester.uid,
          updatedAt: new Date()
        },
        { merge: true }
      )

      return res.status(200).json({ success: true, id: subscriptionId })
    }

    return res.status(400).json({ success: false, error: 'Ungueltige action' })
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    console.error('Push Subscription API Fehler:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Interner Serverfehler'
    })
  }
}
