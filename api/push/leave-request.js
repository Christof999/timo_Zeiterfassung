const webpush = require('web-push')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')

const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'PUSH_VAPID_PUBLIC_KEY',
  'PUSH_VAPID_PRIVATE_KEY',
  'PUSH_VAPID_SUBJECT'
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

function initWebPush() {
  webpush.setVapidDetails(
    process.env.PUSH_VAPID_SUBJECT,
    process.env.PUSH_VAPID_PUBLIC_KEY,
    process.env.PUSH_VAPID_PRIVATE_KEY
  )
}

async function loadActiveSubscriptions() {
  const db = getFirestore()
  const snapshot = await db
    .collection('adminPushSubscriptions')
    .where('active', '==', true)
    .get()

  const subscriptions = []

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    if (!data.endpoint || !data.keys?.p256dh || !data.keys?.auth) {
      return
    }
    subscriptions.push({
      id: docSnap.id,
      endpoint: data.endpoint,
      keys: data.keys
    })
  })

  return subscriptions
}

async function disableSubscription(docId, statusCode) {
  const db = getFirestore()
  await db.collection('adminPushSubscriptions').doc(docId).set(
    {
      active: false,
      disabledAt: new Date(),
      disableReason: `push_error_${statusCode}`,
      updatedAt: new Date()
    },
    { merge: true }
  )
}

function buildPayload(payload) {
  return JSON.stringify({
    title: 'Neuer Urlaubsantrag',
    body: `${payload.employeeName || 'Mitarbeiter'} hat einen neuen Urlaubsantrag gestellt.`,
    url: '/admin/dashboard',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    leaveRequestId: payload.leaveRequestId || null,
    employeeId: payload.employeeId || null
  })
}

async function loadLeaveRequestForNotification(leaveRequestId) {
  if (!leaveRequestId) {
    throw new Error('leaveRequestId fehlt')
  }

  const db = getFirestore()
  const leaveRequestRef = db.collection('leaveRequests').doc(leaveRequestId)
  const leaveRequestSnap = await leaveRequestRef.get()

  if (!leaveRequestSnap.exists) {
    throw new Error('Urlaubsantrag nicht gefunden')
  }

  const leaveRequestData = leaveRequestSnap.data() || {}

  return {
    ref: leaveRequestRef,
    data: leaveRequestData,
    alreadyNotified: !!leaveRequestData.leavePushNotifiedAt
  }
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
    initWebPush()
    await authorizeRequest(req)

    const requestPayload = req.body || {}
    const leaveRequest = await loadLeaveRequestForNotification(requestPayload.leaveRequestId)
    if (leaveRequest.alreadyNotified) {
      return res.status(200).json({
        success: true,
        sent: 0,
        failed: 0,
        message: 'Push fuer diesen Urlaubsantrag wurde bereits versendet.'
      })
    }

    const subscriptions = await loadActiveSubscriptions()
    if (subscriptions.length === 0) {
      await leaveRequest.ref.set(
        {
          leavePushNotifiedAt: new Date(),
          leavePushSent: 0,
          leavePushFailed: 0,
          leavePushMessage: 'Keine aktiven Push-Subscriptions vorhanden',
          updatedAt: new Date()
        },
        { merge: true }
      )

      return res.status(200).json({
        success: true,
        sent: 0,
        failed: 0,
        message: 'Keine aktiven Push-Subscriptions gefunden.'
      })
    }

    const payload = buildPayload({
      ...requestPayload,
      employeeName: requestPayload.employeeName || leaveRequest.data.employeeName || 'Mitarbeiter',
      employeeId: requestPayload.employeeId || leaveRequest.data.employeeId || null
    })
    let sent = 0
    let failed = 0

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            payload
          )
          sent += 1
        } catch (error) {
          failed += 1
          const statusCode = error?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            await disableSubscription(sub.id, statusCode)
          }
          console.error('Push Versand fehlgeschlagen:', {
            docId: sub.id,
            statusCode,
            message: error?.message
          })
        }
      })
    )

    await leaveRequest.ref.set(
      {
        leavePushNotifiedAt: new Date(),
        leavePushSent: sent,
        leavePushFailed: failed,
        updatedAt: new Date()
      },
      { merge: true }
    )

    return res.status(200).json({ success: true, sent, failed })
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    console.error('Push API Fehler:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Interner Serverfehler'
    })
  }
}
