import { auth } from './firebaseConfig'
import { authReady } from './data/shared'
import type { LvPosition } from '../types/inspection'
import { newId } from '../utils/roomGeometry'

// Aufrufe der KI-Funktionen für die Besichtigung (/api/besichtigung).
// Der Gemini-Schlüssel liegt nur auf dem Server.

async function idToken(): Promise<string> {
  await authReady
  const user = auth.currentUser
  if (!user) throw new Error('Nicht angemeldet – bitte neu einloggen.')
  return user.getIdToken()
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(body)
  })
  const raw = await response.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    // Bei einem Absturz oder zu großer Anfrage kommt Text statt JSON.
  }
  if (!response.ok || !data?.success) {
    if (response.status === 413) throw new Error('Die Bilder sind zu groß für die Übertragung.')
    throw new Error(data?.error || raw.replace(/\s+/g, ' ').trim().slice(0, 200) || `HTTP ${response.status}`)
  }
  return data as T
}

export async function generateLvFromDescription(
  description: string,
  roomSummaries: string[]
): Promise<{ title: string; positions: LvPosition[] }> {
  const data = await post<{ title: string; positions: Omit<LvPosition, 'id'>[] }>('/api/besichtigung', {
    mode: 'lv',
    description,
    rooms: roomSummaries
  })
  return { title: data.title, positions: data.positions.map((p) => ({ ...p, id: newId('pos') })) }
}

export interface VisualizeSurface {
  label: string
  instruction: string
  /** Data-URL oder Firebase-Storage-Adresse */
  tileImage?: string
}

export async function visualizeTiles(baseImage: string, surfaces: VisualizeSurface[], note?: string): Promise<string> {
  const data = await post<{ image: string }>('/api/besichtigung', { mode: 'visualize', baseImage, surfaces, note })
  return data.image
}

/** Sprachaufnahme zu Text – nutzt dieselbe Funktion wie Mörgel. */
export async function transcribe(base64Audio: string, mimeType: string): Promise<string> {
  const data = await post<{ text: string }>('/api/agent', { mode: 'transcribe', audio: base64Audio, mimeType })
  return (data.text || '').trim()
}
