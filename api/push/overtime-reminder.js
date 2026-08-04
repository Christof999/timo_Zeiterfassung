const webpush = require('web-push')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')

// Monatsend-Erinnerung an alle Mitarbeiter: „Bitte abzurechnende Stunden
// hinterlegen." Wird vom Admin im Zeiterfassungsbericht per Knopf ausgelöst.
//
// Zwei Wege gehen parallel raus:
//   1. Push auf die Geräte (diese Function)
//   2. Popup in der App – über das Broadcast-Dokument in Firestore, das der
//      Client live mitliest. Das schreibt der Admin-Client selbst.
//
// Push erreicht nur Geräte, die sich in der Mitarbeiter-App einmal für
// Benachrichtigungen angemeldet haben (Collection employeePushSubscriptions).

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
  if (getApps().length > 0) return
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

async function authorizeRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized')
  const bearerToken = authHeader.slice('Bearer '.length).trim()
  if (!bearerToken) throw new Error('Unauthorized')
  if (process.env.PUSH_API_TOKEN && bearerToken === process.env.PUSH_API_TOKEN) {
    return { uid: 'service-token' }
  }
  const decoded = await getAuth().verifyIdToken(bearerToken)
  return { uid: decoded.uid }
}

async function loadActiveEmployeeSubscriptions() {
  const db = getFirestore()
  const snapshot = await db
    .collection('employeePushSubscriptions')
    .where('active', '==', true)
    .get()

  const subscriptions = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    if (!data.endpoint || !data.keys?.p256dh || !data.keys?.auth) return
    subscriptions.push({ id: docSnap.id, endpoint: data.endpoint, keys: data.keys })
  })
  return subscriptions
}

async function disableSubscription(docId, statusCode) {
  const db = getFirestore()
  await db.collection('employeePushSubscriptions').doc(docId).set(
    {
      active: false,
      disabledAt: new Date(),
      disableReason: `push_error_${statusCode}`,
      updatedAt: new Date()
    },
    { merge: true }
  )
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

    const subscriptions = await loadActiveEmployeeSubscriptions()
    if (subscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        failed: 0,
        message:
          'Keine Mitarbeiter-Geräte für Benachrichtigungen angemeldet. Das Popup in der App erscheint trotzdem.'
      })
    }

    // Klick auf die Benachrichtigung landet direkt auf der Verrechnungsseite –
    // der Service Worker wertet `url` aus.
    const payload = JSON.stringify({
      title: 'Stunden abrechnen',
      body: 'Bitte hinterlege deine abzurechnenden Überstunden für diesen Monat.',
      url: '/overtime',
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    })

    let sent = 0
    let failed = 0

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
          sent += 1
        } catch (error) {
          failed += 1
          const statusCode = error?.statusCode
          // Abgemeldete oder abgelaufene Geräte stillegen, sonst wächst die
          // Fehlerquote mit jedem Versand.
          if (statusCode === 404 || statusCode === 410) {
            await disableSubscription(sub.id, statusCode).catch(() => {})
          }
        }
      })
    )

    return res.status(200).json({ success: true, sent, failed })
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    console.error('Überstunden-Erinnerung Push Fehler:', error)
    return res.status(500).json({ success: false, error: error?.message || 'Interner Serverfehler' })
  }
}
