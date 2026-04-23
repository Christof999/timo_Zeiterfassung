import type { TimeEntry } from '../types'

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Liefert Koordinaten aus Firestore GeoPoint oder plain { lat, lng }. */
export function getClockInCoordinates(entry: TimeEntry | null | undefined): { lat: number; lng: number } | null {
  if (!entry?.clockInLocation) return null
  const loc = entry.clockInLocation as Record<string, unknown> & { toJSON?: () => { latitude: number; longitude: number } }
  if (typeof loc.toJSON === 'function') {
    try {
      const j = loc.toJSON()
      if (isFiniteNumber(j.latitude) && isFiniteNumber(j.longitude)) {
        return { lat: j.latitude, lng: j.longitude }
      }
    } catch {
      /* ignore */
    }
  }
  const latRaw = loc.latitude ?? loc.lat
  const lngRaw = loc.longitude ?? loc.lng
  const lat = typeof latRaw === 'object' && latRaw !== null && 'latitude' in latRaw ? (latRaw as { latitude: number }).latitude : latRaw
  const lng = typeof lngRaw === 'object' && lngRaw !== null && 'longitude' in lngRaw ? (lngRaw as { longitude: number }).longitude : lngRaw
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null
  return { lat, lng }
}

/** Kurztext für Admin Live-Aktivität (Einstempel-Ort). */
export function formatClockInLocationLabel(entry: TimeEntry | null | undefined): string | null {
  const c = getClockInCoordinates(entry)
  if (!c) return null
  return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`
}
