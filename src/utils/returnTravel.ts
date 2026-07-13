import type { TimeEntry } from '../types'

/**
 * Fester Firmenstandort (Ausgangspunkt) für die Rückfahrt-Gutschrift.
 * Das Geschäft liegt in Stopfenheim (Ortsteil von 91792 Ellingen).
 *
 * Die Koordinaten sind eine Näherung für Stopfenheim. Weil die Gutschrift in
 * groben Entfernungs-Stufen (siehe CREDIT_TIERS) vergeben wird, wirkt sich eine
 * kleine Abweichung nur direkt an den Stufengrenzen aus. Bei Bedarf können die
 * exakten Koordinaten hier nachgetragen werden.
 */
export const RETURN_HOME_BASE = {
  address: 'Stopfenheim, 91792 Ellingen',
  lat: 49.034,
  lng: 10.905
}

/**
 * Entfernungs-Staffel (Radius Firma → Standort des Mitarbeiters, Luftlinie) für
 * die anrechenbare Fahrtzeit-Gutschrift beim Ausstempeln. Feste Vorgabe:
 *   - bis 20 km:   0 Min
 *   - 20 bis 50 km: 10 Min
 *   - 50 bis 70 km: 15 Min
 *   - ab 70 km:    20 Min
 * Die Stufen sind absteigend nach Mindest-Entfernung sortiert (erste passende gilt).
 */
const CREDIT_TIERS: Array<{ minKm: number; minutes: number }> = [
  { minKm: 70, minutes: 20 },
  { minKm: 50, minutes: 15 },
  { minKm: 20, minutes: 10 },
  { minKm: 0, minutes: 0 }
]

/** Gutschrift (Minuten) für eine gegebene Entfernung anhand der Staffel. */
const creditMinutesForDistance = (distanceKm: number): number => {
  for (const tier of CREDIT_TIERS) {
    if (distanceKm >= tier.minKm) return tier.minutes
  }
  return 0
}

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number): number => (deg * Math.PI) / 180

const isValidCoord = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Luftlinie (km) zwischen zwei Koordinaten (Haversine). */
const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface ReturnTravelEstimate {
  /** Entfernung Firmenstandort → Standort des Mitarbeiters (km, Luftlinie/Radius) */
  distanceKm: number
  /** Gutgeschriebene Fahrtzeit laut Entfernungs-Staffel (Minuten) */
  creditMinutes: number
  /** Gutgeschriebene Zeit in Millisekunden (für die gebuchte Arbeitszeit) */
  creditMs: number
}

/**
 * Bestimmt aus den beim Ausstempeln erfassten GPS-Koordinaten (≈ Standort des
 * Mitarbeiters) die Entfernung zum Firmenstandort und die daraus resultierende
 * Fahrtzeit-Gutschrift gemäß fester Entfernungs-Staffel (CREDIT_TIERS).
 * Liefert null, wenn keine gültigen Koordinaten vorliegen.
 */
export const estimateReturnTravel = (
  location: { lat: number | null; lng: number | null } | null | undefined
): ReturnTravelEstimate | null => {
  if (!location || !isValidCoord(location.lat) || !isValidCoord(location.lng)) {
    return null
  }

  const distanceKm = haversineKm({ lat: location.lat, lng: location.lng }, RETURN_HOME_BASE)
  const creditMinutes = creditMinutesForDistance(distanceKm)
  const creditMs = Math.round(creditMinutes * 60 * 1000)

  return { distanceKm, creditMinutes, creditMs }
}

/**
 * Kurzer Hinweistext für die Ausstempel-Bestätigung (z. B. Toast).
 * Leerstring, wenn keine Gutschrift anfällt.
 */
export const formatReturnTravelCreditNote = (
  location: { lat: number | null; lng: number | null } | null | undefined
): string => {
  const travel = estimateReturnTravel(location)
  if (!travel || travel.creditMinutes < 1) return ''
  return ` Rückfahrt: ${Math.round(travel.creditMinutes)} Min. angerechnet.`
}

/**
 * Liest die beim Ausstempeln gespeicherte Rückfahrt-Gutschrift (in Millisekunden)
 * aus einem Zeiteintrag. Alte Einträge ohne gespeicherten Wert ergeben 0.
 */
export const getReturnTravelCreditMs = (
  entry: Pick<TimeEntry, 'returnTravelCreditMs'> | null | undefined
): number => {
  const ms = entry?.returnTravelCreditMs
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : 0
}
