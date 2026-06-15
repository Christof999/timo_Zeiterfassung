import type { TimeEntry } from '../types'

/**
 * Fester Heimat-/Firmenstandort für die Rückfahrt-Berechnung.
 * Adresse: Störzelbacher Str. 21, 91792 Ellingen.
 *
 * Die Koordinaten sind eine Näherung für 91792 Ellingen. Eine kleine Abweichung
 * wirkt sich auf die Schätzung nur minimal aus (ca. 0,6 Min. Gutschrift je 1 km),
 * sie können bei Bedarf aber exakt nachgetragen werden.
 */
export const RETURN_HOME_BASE = {
  address: 'Störzelbacher Str. 21, 91792 Ellingen',
  lat: 49.059,
  lng: 10.963
}

/** Umrechnung Luftlinie → grobe Straßenentfernung (Umwegfaktor). */
const ROAD_DISTANCE_FACTOR = 1.3
/** Angenommene Durchschnittsgeschwindigkeit für den Rückweg (km/h). */
const AVERAGE_SPEED_KMH = 50
/** Anteil der Rückfahrt, der als Arbeitszeit gutgeschrieben wird (die Hälfte). */
const CREDIT_SHARE = 0.5

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
  /** Geschätzte Straßenentfernung Baustelle → Firmenstandort (km) */
  distanceKm: number
  /** Geschätzte einfache Fahrtzeit für den Rückweg (Minuten) */
  oneWayMinutes: number
  /** Gutgeschriebene Zeit = halbe Rückfahrt (Minuten) */
  creditMinutes: number
  /** Gutgeschriebene Zeit in Millisekunden (für die gebuchte Arbeitszeit) */
  creditMs: number
}

/**
 * Schätzt aus den beim Ausstempeln erfassten GPS-Koordinaten (≈ Baustelle) die
 * Rückfahrt zum Firmenstandort und die anrechenbare halbe Fahrtzeit.
 * Liefert null, wenn keine gültigen Koordinaten vorliegen.
 */
export const estimateReturnTravel = (
  location: { lat: number | null; lng: number | null } | null | undefined
): ReturnTravelEstimate | null => {
  if (!location || !isValidCoord(location.lat) || !isValidCoord(location.lng)) {
    return null
  }

  const distanceKm =
    haversineKm({ lat: location.lat, lng: location.lng }, RETURN_HOME_BASE) *
    ROAD_DISTANCE_FACTOR
  const oneWayMinutes = (distanceKm / AVERAGE_SPEED_KMH) * 60
  const creditMinutes = oneWayMinutes * CREDIT_SHARE
  const creditMs = Math.round(creditMinutes * 60 * 1000)

  return { distanceKm, oneWayMinutes, creditMinutes, creditMs }
}

/**
 * Kurzer Hinweistext für die Ausstempel-Bestätigung (z. B. Toast).
 * Leerstring, wenn keine nennenswerte Gutschrift anfällt.
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
