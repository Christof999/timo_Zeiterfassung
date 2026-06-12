import type { TimeEntry } from '../types'

const HEAVY_OBJECT_KEYS = new Set([
  'base64Data',
  'base64',
  'base64String',
  'base64DataUrl',
  'data'
])

/** Entfernt eingebettete Bild-Binärdaten aus Zeiteinträgen (Legacy), behält IDs und Storage-URLs. */
export function sanitizeTimeEntryForRead<T extends TimeEntry>(entry: T): T {
  const out = { ...entry } as T & Record<string, unknown>

  const stripArray = (arr: unknown[] | undefined): unknown[] | undefined => {
    if (!arr || !Array.isArray(arr)) return arr
    return arr.map((item) => stripHeavyValue(item, 0))
  }

  out.sitePhotos = stripArray(entry.sitePhotos as unknown[] | undefined) as T['sitePhotos']
  out.documents = stripArray(entry.documents as unknown[] | undefined) as T['documents']
  out.photos = stripArray(entry.photos as unknown[] | undefined) as T['photos']

  if (entry.liveDocumentation && Array.isArray(entry.liveDocumentation)) {
    out.liveDocumentation = entry.liveDocumentation.map((block) => {
      if (!block || typeof block !== 'object') return block
      const next = { ...block }
      if (Array.isArray(next.images)) {
        next.images = next.images.map((img) => stripHeavyValue(img, 0))
      }
      if (Array.isArray(next.documents)) {
        next.documents = next.documents.map((doc) => stripHeavyValue(doc, 0))
      }
      return next
    })
  }

  return out as T
}

function stripHeavyValue(value: unknown, depth: number): unknown {
  if (depth > 14 || value == null) return value
  if (typeof value === 'string') {
    if (value.length > 500 && (value.startsWith('/9j/') || value.startsWith('iVBOR') || value.startsWith('data:'))) {
      return undefined
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripHeavyValue(v, depth + 1))
  }
  if (typeof value === 'object') {
    const o = { ...(value as Record<string, unknown>) }
    for (const key of HEAVY_OBJECT_KEYS) {
      if (key in o) delete o[key]
    }
    for (const [k, v] of Object.entries(o)) {
      if (v !== null && typeof v === 'object') {
        o[k] = stripHeavyValue(v, depth + 1)
      } else if (typeof v === 'string' && HEAVY_OBJECT_KEYS.has(k)) {
        delete o[k]
      }
    }
    return o
  }
  return value
}
