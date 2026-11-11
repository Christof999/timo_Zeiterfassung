import { postWithIdToken } from '../services/data/shared'

/** Die gemeinsame Adresssuche prüft Berechtigungen, Cache und Anfragelimit auf dem Server. */
export async function reverseGeocode(lat: number, lng: number, inspectionId?: string): Promise<string> {
  const data = await postWithIdToken('/api/geocode', { lat, lng, ...(inspectionId ? { inspectionId } : {}) })
  if (typeof data?.address !== 'string') throw new Error('Der Server hat keine gültige Adresse geliefert.')
  return data.address
}
