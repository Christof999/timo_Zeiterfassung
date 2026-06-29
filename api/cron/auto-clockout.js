'use strict'

/**
 * Automatisches Ausstempeln um 18:00 (Europe/Berlin).
 *
 * Wird von einem Vercel Cron Job aufgerufen (siehe vercel.json). Schließt alle
 * noch offenen Zeiteinträge (clockOutTime == null) und setzt die Ausstempelzeit
 * auf 18:00 des jeweiligen Einstempel-Tages. Danach erhält der Admin EINE
 * Sammel-Push-Benachrichtigung (gleicher Mechanismus wie bei Urlaubsanträgen).
 *
 * Regeln:
 * - Harte Grenze 18:00 für alle. Pause = 0. Markierung autoClockOut = true.
 * - Keine Rückfahrt-Gutschrift (kein GPS beim automatischen Ausstempeln).
 * - Idempotent: ein bereits ausgestempelter Eintrag wird nicht erneut angefasst.
 *
 * Auth: Vercel setzt bei gesetztem CRON_SECRET automatisch den Header
 *   Authorization: Bearer <CRON_SECRET>
 * an Cron-Requests. Zum manuellen Testen wird zusätzlich PUSH_API_TOKEN als
 * Bearer akzeptiert (mit ?force=1 lässt sich die 18-Uhr-Sperre dabei umgehen).
 */

const webpush = require('web-push')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const TIME_ZONE = 'Europe/Berlin'
const CUTOFF_HOUR = 18

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

/** Wall-Clock-Bestandteile eines Zeitpunkts in der Zielzeitzone. */
function getZonedParts(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const parts = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

/**
 * UTC-Zeitpunkt (Date) für eine Berliner Wand-Uhrzeit, DST-sicher über
 * Offset-Korrektur (kein externes Zeitzonen-Paket nötig).
 */
function zonedWallTimeToUTC(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const back = getZonedParts(new Date(guess))
  const asIfUTC = Date.UTC(back.year, back.month - 1, back.day, back.hour, back.minute, back.second)
  const offset = asIfUTC - guess // ms, um die die Zone der UTC voraus ist
  return new Date(guess - offset)
}

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6)
  }
  return null
}

function authorize(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized')
  const token = authHeader.slice('Bearer '.length).trim()
  const cronSecret = process.env.CRON_SECRET
  const apiToken = process.env.PUSH_API_TOKEN
  if (cronSecret && token === cronSecret) return { source: 'cron' }
  if (apiToken && token === apiToken) return { source: 'service-token' }
  throw new Error('Unauthorized')
}

async function loadActiveAdminSubscriptions(db) {
  const snapshot = await db
    .collection('adminPushSubscriptions')
    .where('active', '==', true)
    .get()
  const subs = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    if (!data.endpoint || !data.keys?.p256dh || !data.keys?.auth) return
    subs.push({ id: docSnap.id, endpoint: data.endpoint, keys: data.keys })
  })
  return subs
}

async function disableSubscription(db, docId, statusCode) {
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

async function sendAdminPush(db, names) {
  const subscriptions = await loadActiveAdminSubscriptions(db)
  if (subscriptions.length === 0) return { sent: 0, failed: 0 }

  const count = names.length
  const list = names.slice(0, 8).join(', ') + (count > 8 ? ` u. ${count - 8} weitere` : '')
  const payload = JSON.stringify({
    title: 'Automatisches Ausstempeln (18:00)',
    body:
      count === 1
        ? `1 Mitarbeiter wurde um 18:00 automatisch ausgestempelt: ${list}`
        : `${count} Mitarbeiter wurden um 18:00 automatisch ausgestempelt: ${list}`,
    url: '/admin/dashboard',
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
        if (statusCode === 404 || statusCode === 410) {
          await disableSubscription(db, sub.id, statusCode)
        }
        console.error('Auto-Clockout Push fehlgeschlagen:', {
          docId: sub.id,
          statusCode,
          message: error?.message
        })
      }
    })
  )
  return { sent, failed }
}

module.exports = async function handler(req, res) {
  // Cron-Trigger kommen als GET; POST fürs manuelle Testen ebenfalls erlauben.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    assertEnv()
    initFirebaseAdmin()
    initWebPush()
    const auth = authorize(req)

    const force = req.query?.force === '1' || req.query?.force === 'true'
    const now = new Date()
    const nowParts = getZonedParts(now)

    // Sicherheitsnetz: nur ab 18:00 Berliner Zeit ausführen (außer erzwungen).
    if (!force && nowParts.hour < CUTOFF_HOUR) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: `Vor ${CUTOFF_HOUR}:00 Uhr (Berlin) – nichts zu tun.`,
        berlinHour: nowParts.hour
      })
    }

    const db = getFirestore()
    const snapshot = await db.collection('timeEntries').where('clockOutTime', '==', null).get()

    const clockedOutNames = []
    let processed = 0
    let skipped = 0

    for (const docSnap of snapshot.docs) {
      const entry = docSnap.data() || {}
      // Urlaubstage und Einträge ohne Einstempelzeit nicht anfassen.
      if (entry.isVacationDay === true) {
        skipped += 1
        continue
      }
      const clockIn = toDate(entry.clockInTime)
      if (!clockIn) {
        skipped += 1
        continue
      }

      // 18:00 des Einstempel-Tages (Berlin). Deckt auch vergessene Einträge
      // aus Vortagen sauber ab.
      const ciParts = getZonedParts(clockIn)
      const cutoff = zonedWallTimeToUTC(ciParts.year, ciParts.month, ciParts.day, CUTOFF_HOUR, 0, 0)

      // Wenn 18:00 vor dem Einstempeln liegt (z. B. erst nach 18:00 eingestempelt)
      // oder noch in der Zukunft, nicht automatisch kürzen.
      if (cutoff.getTime() <= clockIn.getTime() || cutoff.getTime() > now.getTime()) {
        skipped += 1
        continue
      }

      const entryRef = docSnap.ref
      const updateData = {
        clockOutTime: Timestamp.fromDate(cutoff),
        pauseTotalTime: 0,
        autoClockOut: true,
        autoClockOutAt: Timestamp.fromDate(now),
        notes: entry.notes
          ? `${entry.notes}\n[Automatisch um 18:00 ausgestempelt]`
          : 'Automatisch um 18:00 ausgestempelt',
        heroSyncStatus: 'pending'
      }
      await entryRef.update(updateData)

      // Mitarbeiter-Dokument: aktiven Eintrag freigeben + Namen für die Nachricht.
      let name = null
      if (entry.employeeId) {
        try {
          const empRef = db.collection('employees').doc(entry.employeeId)
          const empSnap = await empRef.get()
          if (empSnap.exists) {
            const emp = empSnap.data() || {}
            name =
              emp.name ||
              [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() ||
              emp.username ||
              null
            if (emp.activeTimeEntryId === docSnap.id) {
              await empRef.set(
                { activeTimeEntryId: null, activeClockInAt: null, updatedAt: new Date() },
                { merge: true }
              )
            }
          }
        } catch (e) {
          console.error('Mitarbeiter-Update fehlgeschlagen für', entry.employeeId, e?.message)
        }
      }
      clockedOutNames.push(name || entry.employeeId || 'Unbekannt')
      processed += 1
    }

    let push = { sent: 0, failed: 0 }
    if (processed > 0) {
      push = await sendAdminPush(db, clockedOutNames)
    }

    // Protokoll für Nachvollziehbarkeit.
    try {
      await db.collection('autoClockOutLogs').add({
        runAt: Timestamp.fromDate(now),
        triggeredBy: auth.source,
        processed,
        skipped,
        names: clockedOutNames,
        pushSent: push.sent,
        pushFailed: push.failed
      })
    } catch (e) {
      console.error('autoClockOutLog konnte nicht geschrieben werden:', e?.message)
    }

    return res.status(200).json({
      success: true,
      processed,
      skipped,
      names: clockedOutNames,
      push
    })
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    console.error('Auto-Clockout Fehler:', error)
    return res.status(500).json({ success: false, error: error?.message || 'Interner Serverfehler' })
  }
}
