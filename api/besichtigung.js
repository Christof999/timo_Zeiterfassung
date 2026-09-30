const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

// Besichtigung – KI-Helfer für den Termin beim Kunden.
//
//   mode 'lv':        Beschreibung + Raummaße → Leistungsverzeichnis mit Positionen
//   mode 'visualize': Raumfoto + Fliesenfoto(s) → fotorealistisches Bild mit neuen Fliesen
//
// Wie /api/agent ein schlanker Proxy zu Gemini: der Schlüssel bleibt hier, und
// nur angemeldete App-Nutzer dürfen rufen. Die Hilfsfunktionen stehen bewusst
// in dieser Datei statt in einem gemeinsamen Modul – Vercel bündelt jede
// Funktion für sich.

const requiredEnv = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'GEMINI_API_KEY']

const TEXT_MODELS = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'].filter(Boolean)
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

/** Bilder werden nur aus dem eigenen Firebase Storage nachgeladen, nicht von beliebigen Adressen. */
const ALLOWED_IMAGE_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com']
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Mehr Artikel blähen den Prompt auf, ohne die Zuordnung besser zu machen. */
const MAX_ARTICLES = 800

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
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) throw new Error('Unauthorized')
  await getAuth().verifyIdToken(token)
}

async function callGemini(model, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
  // Überlastung und Zeitüberschreitung kommen bei Bildaufrufen öfter vor –
  // ein zweiter Versuch hilft meistens.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json().catch(() => null)
    if (response.ok) return data
    const message = data?.error?.message || `Gemini HTTP ${response.status}`
    const error = new Error(message)
    error.statusCode = response.status
    const retryable = [429, 500, 503, 504].includes(response.status) || /overloaded|deadline|unavailable/i.test(message)
    if (!retryable || attempt === 2) throw error
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

function parts(data) {
  return data?.candidates?.[0]?.content?.parts || []
}

// --- Leistungsverzeichnis ------------------------------------------------

const LV_INSTRUCTION = `Du erstellst Leistungsverzeichnisse für einen deutschen Fliesenleger-Meisterbetrieb, der auch Bäder komplett saniert.

Eingabe: die Notizen des Handwerkers aus der Besichtigung beim Kunden, dazu – falls vorhanden – die gemessenen Räume mit Flächen und der Artikelstamm des Betriebs.

Aufgabe 1 – text: eine ausformulierte Leistungsbeschreibung für das Anschreiben des Angebots.
- Erste Zeile: dieselbe Überschrift wie title.
- Danach nummerierte Abschnitte: Zeile "<Nummer>. <Titel>", darunter zwei bis vier Sätze, die anschaulich beschreiben, was ausgeführt wird, wie es ausgeführt wird und worauf der Betrieb dabei achtet (Untergrund, Abdichtung, Gefälle, Fugenbild, saubere Anschlüsse, Schutz der Wohnung, Entsorgung).
- Fachlich korrekt, wertig und für den Kunden verständlich, in der dritten Form ("Die vorhandenen Fliesen werden …"). Keine Anrede, keine Grußformel, keine Preise, keine Mengen, keine Markdown-Zeichen wie ** oder #.
- Die Abschnitte folgen dem Ablauf auf der Baustelle, von der Einrichtung bis zur Reinigung.

Aufgabe 2 – positions: die Positionen für das Angebot.
- Jede Position hat einen Abschnitt (group), einen Kurztext (shortText, max. 70 Zeichen), einen Langtext (longText, ein bis zwei Sätze in der im Bauwesen üblichen Sprache: "fachgerecht verlegen", "einschließlich Zuschnitt"), eine Menge (quantity) und eine Einheit (unit).
- Einheiten: "m²", "m" (laufende Meter), "Stk", "psch" (pauschal), "h".
- Mengen aus den Raummaßen ableiten: Boden = Bodenfläche, Wand = Wandfläche (bei Teilhöhen anteilig), Sockel = Umfang. Ist eine Menge nicht ableitbar, quantity = null.
- Baustelleneinrichtung am Anfang und Baustellenreinigung am Ende ergänzen (je 1 psch).
- Alles, was in den Notizen steht, muss sich wiederfinden. Nichts erfinden, was dort nicht steht, außer fachlich zwingend nötigen Arbeitsschritten (z. B. Grundierung vor Abdichtung).
- KEINE Preise.
- title: "Leistungsverzeichnis - <Gewerk> <Raum/Ort>".
- articleId: Passt ein Artikel aus dem Artikelstamm fachlich zur Position, trage seine ID ein – exakt wie in der Liste – und übernimm die Einheit des Artikels. Nur eindeutige Treffer zuordnen, sonst articleId = null. Niemals eine ID erfinden.`

const LV_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    text: { type: 'STRING' },
    positions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          group: { type: 'STRING' },
          shortText: { type: 'STRING' },
          longText: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING' },
          articleId: { type: 'STRING', nullable: true }
        },
        required: ['shortText', 'unit']
      }
    }
  },
  required: ['title', 'text', 'positions']
}

/** Markdown-Reste entfernen, falls das Modell trotz Ansage welche schickt. */
function cleanText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[ \t]*#+[ \t]*/gm, '')
    .replace(/\*+/g, '')
    .trim()
}

async function generateLv(body) {
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const rooms = Array.isArray(body.rooms) ? body.rooms.filter((r) => typeof r === 'string') : []
  // Artikelstamm: nur, was die KI zum Zuordnen braucht. Die Liste kommt vom
  // angemeldeten Client aus der Collection materialTypes.
  const articles = (Array.isArray(body.articles) ? body.articles : [])
    .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')
    .slice(0, MAX_ARTICLES)
    .map((a) => ({ id: a.id, name: a.name.slice(0, 120), unit: String(a.unit || '').slice(0, 20) }))
  const articleById = new Map(articles.map((a) => [a.id, a]))
  if (description.length < 10) {
    return { status: 400, body: { success: false, error: 'Bitte zuerst beschreiben, was gemacht werden soll.' } }
  }
  if (description.length > 6000) {
    return { status: 400, body: { success: false, error: 'Die Beschreibung ist zu lang.' } }
  }

  const userText = [
    `Notizen aus der Besichtigung:\n${description}`,
    rooms.length ? `Gemessene Räume:\n${rooms.map((r) => `- ${r}`).join('\n')}` : 'Es wurden noch keine Räume gemessen.',
    articles.length
      ? `Artikelstamm (ID | Name | Einheit):\n${articles.map((a) => `${a.id} | ${a.name} | ${a.unit}`).join('\n')}`
      : 'Es ist kein Artikelstamm hinterlegt – articleId ist immer null.'
  ].join('\n\n')

  let lastError = null
  for (const model of TEXT_MODELS) {
    try {
      const data = await callGemini(model, {
        system_instruction: { parts: [{ text: LV_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
          responseSchema: LV_SCHEMA
        }
      })
      const text = parts(data).map((p) => p.text || '').join('')
      const parsed = JSON.parse(text)
      const positions = (Array.isArray(parsed.positions) ? parsed.positions : [])
        .filter((p) => p && typeof p.shortText === 'string' && p.shortText.trim())
        .map((p) => {
          // Nur IDs übernehmen, die es wirklich gibt – erfundene fallen hier raus.
          const article = typeof p.articleId === 'string' ? articleById.get(p.articleId.trim()) : undefined
          return {
            group: typeof p.group === 'string' ? p.group.trim() : '',
            shortText: p.shortText.trim(),
            longText: typeof p.longText === 'string' ? p.longText.trim() : '',
            quantity: typeof p.quantity === 'number' && isFinite(p.quantity) ? Math.round(p.quantity * 100) / 100 : null,
            unit: article?.unit || (typeof p.unit === 'string' && p.unit.trim() ? p.unit.trim() : 'psch'),
            ...(article ? { articleId: article.id, articleName: article.name } : {})
          }
        })
      if (positions.length === 0) {
        return { status: 502, body: { success: false, error: 'Die KI hat keine Positionen geliefert. Bitte die Beschreibung ergänzen.' } }
      }
      return {
        status: 200,
        body: {
          success: true,
          title: String(parsed.title || 'Leistungsverzeichnis'),
          text: cleanText(typeof parsed.text === 'string' ? parsed.text : ''),
          positions
        }
      }
    } catch (error) {
      lastError = error
      // Nur ein nicht freigeschaltetes Modell rechtfertigt den nächsten Versuch.
      if (error.statusCode !== 404) break
    }
  }
  throw lastError || new Error('Die KI konnte kein Leistungsverzeichnis erzeugen.')
}

// --- Fliesen-Visualisierung (aus dem Fliesenplaner übernommen) -----------

async function imagePart(source) {
  if (typeof source !== 'string' || !source) return null
  const match = /^data:([^;]+);base64,(.*)$/s.exec(source)
  if (match) return { inline_data: { mime_type: match[1], data: match[2] } }

  let url
  try {
    url = new URL(source)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.includes(url.hostname)) return null
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Bild konnte nicht geladen werden (HTTP ${response.status}).`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Das Bild ist zu groß.')
  const mime = (response.headers.get('content-type') || 'image/jpeg').split(';')[0]
  return { inline_data: { mime_type: mime, data: buffer.toString('base64') } }
}

const BASE_RULE =
  'Du bist ein fotorealistischer Bild-Editor für einen Fliesenleger. ' +
  'Das ERSTE Bild ist das Original-Raumfoto und darf in Perspektive, Kameraposition, ' +
  'Beleuchtung, Möbeln, Sanitärobjekten und Raumgeometrie NICHT verändert werden. '
const QUALITY_RULE =
  'Achte auf saubere Kanten an Übergängen (z. B. Wand/Boden, Sockel, Ecken) und behalte ' +
  'Schatten sowie Lichtverlauf des Originals bei. Gib NUR das fertige, bearbeitete Foto zurück.'

async function visualize(body) {
  const base = await imagePart(body.baseImage)
  if (!base) return { status: 400, body: { success: false, error: 'Das Raumfoto fehlt.' } }

  const surfaces = Array.isArray(body.surfaces) ? body.surfaces.slice(0, 4) : []
  if (surfaces.length === 0) return { status: 400, body: { success: false, error: 'Bitte mindestens eine Fläche wählen.' } }

  const ordinals = ['ZWEITE', 'DRITTE', 'VIERTE', 'FÜNFTE']
  const lines = []
  const tileParts = []
  for (const surface of surfaces) {
    const label = String(surface.label || 'Fläche')
    const instruction = String(surface.instruction || `Belege die Fläche "${label}" mit den neuen Fliesen.`).slice(0, 600)
    const tile = await imagePart(surface.tileImage)
    if (tile) {
      lines.push(`- ${label}: verwende das ${ordinals[tileParts.length]} Bild als Fliesen-Referenz. ${instruction}`)
      tileParts.push(tile)
    } else {
      lines.push(`- ${label}: ${instruction}`)
    }
  }

  const prompt =
    BASE_RULE +
    'Belege die folgenden Flächen des Raumes mit neuen Fliesen. Ordne jede Fliesen-Referenz exakt der ' +
    'genannten Fläche zu und übernimm Farbe, Maserung, Format, Fugenbild und Oberfläche möglichst exakt, ' +
    'perspektivisch korrekt mit realistischen Fugen und Reflexionen. ' +
    QUALITY_RULE +
    '\n\nFlächen:\n' +
    lines.join('\n') +
    (body.note ? `\n\nZusätzlicher Hinweis: ${String(body.note).slice(0, 400)}` : '')

  const data = await callGemini(IMAGE_MODEL, {
    contents: [{ role: 'user', parts: [{ text: prompt }, base, ...tileParts] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
  })

  let text = ''
  for (const part of parts(data)) {
    const inline = part.inline_data || part.inlineData
    if (inline?.data) {
      const mime = inline.mime_type || inline.mimeType || 'image/png'
      return { status: 200, body: { success: true, image: `data:${mime};base64,${inline.data}` } }
    }
    if (part.text) text += part.text
  }
  return {
    status: 502,
    body: { success: false, error: 'Die KI hat kein Bild geliefert. Bitte noch einmal versuchen oder ein anderes Foto wählen.', text }
  }
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
    const result =
      body.mode === 'lv'
        ? await generateLv(body)
        : body.mode === 'visualize'
          ? await visualize(body)
          : { status: 400, body: { success: false, error: 'Unbekannter Modus' } }
    return res.status(result.status).json(result.body)
  } catch (error) {
    if (error?.message === 'Unauthorized') {
      return res.status(401).json({ success: false, error: 'Nicht angemeldet – bitte neu einloggen.' })
    }
    console.error('Besichtigung API Fehler:', error)
    const busy = error?.statusCode === 429 || /overloaded|deadline|timeout/i.test(error?.message || '')
    return res.status(busy ? 503 : 500).json({
      success: false,
      error: busy
        ? 'Die KI ist gerade ausgelastet. Bitte in einer Minute noch einmal versuchen.'
        : error?.message || 'Interner Serverfehler'
    })
  }
}
