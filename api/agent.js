const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

// Mörgel – KI-Assistent fürs Admin-Panel.
// Diese Function ist ein schlanker Proxy zur Google-Gemini-API: Sie hält den
// GEMINI_API_KEY serverseitig geheim und verifiziert, dass die Anfrage von
// einem angemeldeten App-Nutzer kommt. Die eigentlichen Lese-/Schreibaktionen
// auf Firestore laufen weiterhin clientseitig über den DataService (mit der
// bereits authentifizierten Admin-Session) – wie bei manuellen Aktionen im
// Dashboard. Mörgel wird im Frontend nur Admins angezeigt.

const requiredEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GEMINI_API_KEY'
]

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

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

async function authorizeRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }
  const bearerToken = authHeader.slice('Bearer '.length).trim()
  if (!bearerToken) {
    throw new Error('Unauthorized')
  }
  const decoded = await getAuth().verifyIdToken(bearerToken)
  return { uid: decoded.uid }
}

async function callGemini(payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data?.error?.message || `Gemini HTTP ${response.status}`
    throw new Error(message)
  }
  return data
}

function firstCandidateParts(data) {
  return data?.candidates?.[0]?.content?.parts || []
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    assertEnv()
    initFirebaseAdmin()
    await authorizeRequest(req)

    const body = req.body || {}
    const mode = body.mode || 'chat'

    // --- Sprachnachricht → Text ---------------------------------------
    if (mode === 'transcribe') {
      if (!body.audio || !body.mimeType) {
        return res.status(400).json({ success: false, error: 'Audio fehlt' })
      }
      const data = await callGemini({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transkribiere diese deutsche Sprachnachricht wörtlich. Gib ausschließlich den gesprochenen Text zurück, ohne Anführungszeichen oder Zusätze.'
              },
              { inline_data: { mime_type: body.mimeType, data: body.audio } }
            ]
          }
        ]
      })
      const text = firstCandidateParts(data)
        .map((p) => p.text || '')
        .join('')
        .trim()
      return res.status(200).json({ success: true, text })
    }

    // --- Chat / Tool-Use ----------------------------------------------
    if (!Array.isArray(body.contents)) {
      return res.status(400).json({ success: false, error: 'contents fehlt' })
    }

    const payload = {
      contents: body.contents,
      tools: body.tools,
      tool_config: { function_calling_config: { mode: 'AUTO' } }
    }
    if (body.systemInstruction) {
      payload.system_instruction = { parts: [{ text: body.systemInstruction }] }
    }

    const data = await callGemini(payload)
    const parts = firstCandidateParts(data)
    return res.status(200).json({
      success: true,
      parts,
      finishReason: data?.candidates?.[0]?.finishReason || null
    })
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    console.error('Mörgel/Agent API Fehler:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Interner Serverfehler'
    })
  }
}
