const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

// Versand des Zeiterfassungsberichts per E-Mail.
//
// Diese Function ist ein schlanker Proxy zum Email-Proxy: Sie hält den
// EMAILPROXY_KEY serverseitig geheim (im Browser-Bundle hätte er nichts zu
// suchen) und verifiziert, dass die Anfrage von einem angemeldeten App-Nutzer
// kommt — dasselbe Muster wie /api/agent.
//
// Der Bericht selbst wird im Client erzeugt (buildEmployeePrintHtml) und hier
// nur als Anhang durchgereicht.

const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'EMAILPROXY_URL',
  'EMAILPROXY_KEY'
]

/** Anhänge über ~4,5 MB passen nicht in den Request an den Proxy. */
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

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

async function authorizeRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized')
  const bearerToken = authHeader.slice('Bearer '.length).trim()
  if (!bearerToken) throw new Error('Unauthorized')
  await getAuth().verifyIdToken(bearerToken)
}

const isValidEmail = (value) => typeof value === 'string' && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value)

/**
 * Holt das App-Logo vom eigenen Host, damit es als CID-Anhang in der Mail
 * eingebettet werden kann. Bewusst über den Host des Requests statt über eine
 * fest verdrahtete Domain — so funktioniert es auf Produktion und Preview
 * gleichermaßen. Schlägt es fehl, geht die Mail ohne Logo raus.
 */
async function loadBrandLogo(req) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host
    if (!host) return null
    const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
    const response = await fetch(`${protocol}://${host}/brand-logo.png`)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      filename: 'logo.png',
      cid: 'brandlogo',
      content: buffer.toString('base64'),
      contentType: 'image/png'
    }
  } catch (error) {
    console.warn('Logo konnte nicht geladen werden, Mail geht ohne Logo raus:', error?.message)
    return null
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    assertEnv()
    initFirebaseAdmin()
    await authorizeRequest(req)
  } catch (error) {
    const message = error?.message || 'Unbekannter Fehler'
    if (message === 'Unauthorized' || message.includes('token')) {
      res.status(401).json({ error: 'Nicht angemeldet oder Sitzung abgelaufen.' })
      return
    }
    console.error('send-report: Setup fehlgeschlagen:', message)
    res.status(500).json({ error: message })
    return
  }

  const {
    to,
    employeeName,
    periodLabel,
    totalHours,
    grossWage,
    note,
    senderName,
    reportHtml,
    attachmentFilename,
    dryRun
  } = req.body || {}

  if (!isValidEmail(to)) {
    res.status(400).json({ error: 'Bitte eine gültige Empfängeradresse angeben.' })
    return
  }
  if (!reportHtml || typeof reportHtml !== 'string') {
    res.status(400).json({ error: 'Der Bericht fehlt.' })
    return
  }

  const reportBuffer = Buffer.from(reportHtml, 'utf8')
  if (reportBuffer.length > MAX_ATTACHMENT_BYTES) {
    res.status(413).json({
      error: 'Der Bericht ist zu groß für den Mailversand. Bitte den Zeitraum verkleinern.'
    })
    return
  }

  const attachments = [
    {
      filename: attachmentFilename || 'zeiterfassungsbericht.html',
      content: reportBuffer.toString('base64'),
      contentType: 'text/html; charset=utf-8'
    }
  ]

  const logo = await loadBrandLogo(req)
  if (logo) attachments.push(logo)

  try {
    const response = await fetch(`${process.env.EMAILPROXY_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EMAILPROXY_KEY}`
      },
      body: JSON.stringify({
        to,
        template: 'zeitbericht',
        variables: {
          employeeName: employeeName || 'Mitarbeiter',
          periodLabel: periodLabel || '',
          totalHours: totalHours || '0:00',
          grossWage: grossWage || '0,00 €',
          note: note || '',
          senderName: senderName || 'Fliesen Reislöhner GmbH'
        },
        attachments,
        dryRun: dryRun === true
      })
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      // 429/5xx sind vorübergehend – das unterscheidet der Client fürs Retry.
      res.status(response.status).json({
        error: result?.error || 'Der Mailversand wurde abgelehnt.',
        retryable: response.status === 429 || response.status >= 500
      })
      return
    }

    res.status(200).json({ ok: true, dryRun: result?.dryRun === true, preview: result?.preview })
  } catch (error) {
    console.error('send-report: Versand fehlgeschlagen:', error?.message)
    res.status(502).json({ error: 'Der Mailversand ist nicht erreichbar.', retryable: true })
  }
}
