import { formatDateForInputLocal } from './dateUtils'

/**
 * Anfahrten auf eine Baustelle – Grundlage der Kfz-Pauschale.
 *
 * Gezählt wird aus den Stempelsätzen, nicht beim Einstempeln mitgeschrieben:
 * so stimmt die Zahl auch für Baustellen, die schon laufen, und nach jeder
 * Korrektur oder Umbuchung durch den Admin.
 *
 * Bewusst ohne React-/Firestore-Abhängigkeiten. Dieselbe Datei liegt als Kopie
 * im Rechnungsprogramm (src/utils/siteTrips.ts) – beide Programme müssen auf
 * dieselbe Zahl kommen. Änderungen hier dort nachziehen.
 */

/** Stempeln zwei Mitarbeiter so dicht hintereinander ein, sind sie zusammen gefahren. */
export const CARPOOL_WINDOW_MINUTES = 10

export interface SiteTripEntry {
  employeeId: string
  /** Projekt des Stempelsatzes; leer bei Kleinaufträgen (dann zählt der Kunde) */
  projectId?: string | null
  customerId?: string | null
  clockInTime: Date
}

/** Eine Anfahrt: ein Fahrzeug, das an einem Tag die Baustelle angefahren hat. */
export interface SiteTrip {
  /** Kalendertag "YYYY-MM-DD" */
  dateKey: string
  /** Einstempeln des ersten Mitarbeiters der Fahrgemeinschaft */
  startedAt: Date
  /** Wer mitgefahren ist */
  employeeIds: string[]
}

/** Wo wurde gestempelt? Kleinaufträge haben kein Projekt, nur einen Kunden. */
const siteOf = (entry: SiteTripEntry): string =>
  entry.projectId ? `p:${entry.projectId}` : entry.customerId ? `c:${entry.customerId}` : ''

/**
 * Anfahrten auf ein Projekt.
 *
 * Schritt 1 – Ankünfte je Mitarbeiter: Ein Einstempeln zählt, wenn es das erste
 * des Tages ist oder der Mitarbeiter davor woanders gestempelt hat. Ausstempeln
 * zur Mittagspause und wieder rein ist keine neue Anfahrt.
 *
 * Schritt 2 – Fahrgemeinschaften: Ankünfte, die höchstens
 * `windowMinutes` nach der ersten liegen, gehören zum selben Fahrzeug.
 *
 * @param projectId das auszuwertende Projekt
 * @param entries Stempelsätze der beteiligten Mitarbeiter – am besten ALLE
 *   ihrer Sätze, nicht nur die des Projekts. Fehlen die anderen Baustellen,
 *   lässt sich ein Wechsel nicht erkennen; dann zählt je Mitarbeiter und Tag
 *   höchstens eine Anfahrt.
 */
export const countSiteTrips = (
  projectId: string,
  entries: SiteTripEntry[],
  windowMinutes: number = CARPOOL_WINDOW_MINUTES
): SiteTrip[] => {
  const ziel = `p:${projectId}`
  const gueltig = entries.filter(
    (entry) => entry.employeeId && !Number.isNaN(entry.clockInTime?.getTime?.())
  )

  // ── Schritt 1: Ankünfte je Mitarbeiter und Tag ──
  const jeMitarbeiter = new Map<string, SiteTripEntry[]>()
  for (const entry of gueltig) {
    const liste = jeMitarbeiter.get(entry.employeeId)
    if (liste) liste.push(entry)
    else jeMitarbeiter.set(entry.employeeId, [entry])
  }

  const ankuenfte: Array<{ employeeId: string; at: Date; dateKey: string }> = []
  for (const [employeeId, liste] of jeMitarbeiter) {
    liste.sort((a, b) => a.clockInTime.getTime() - b.clockInTime.getTime())
    let vorherTag = ''
    let vorherOrt = ''
    for (const entry of liste) {
      const dateKey = formatDateForInputLocal(entry.clockInTime)
      const ort = siteOf(entry)
      const neuerTag = dateKey !== vorherTag
      if (ort === ziel && (neuerTag || vorherOrt !== ziel)) {
        ankuenfte.push({ employeeId, at: entry.clockInTime, dateKey })
      }
      vorherTag = dateKey
      vorherOrt = ort
    }
  }

  // ── Schritt 2: Fahrgemeinschaften bilden ──
  ankuenfte.sort((a, b) => a.at.getTime() - b.at.getTime())
  const fensterMs = Math.max(0, windowMinutes) * 60 * 1000
  const trips: SiteTrip[] = []
  for (const ankunft of ankuenfte) {
    const letzte = trips[trips.length - 1]
    // Gemessen wird ab dem Ersten der Gruppe, nicht ab dem Vorgänger – sonst
    // hingen über eine Kette beliebig späte Ankünfte am selben Fahrzeug.
    const passt =
      letzte &&
      letzte.dateKey === ankunft.dateKey &&
      ankunft.at.getTime() - letzte.startedAt.getTime() <= fensterMs &&
      !letzte.employeeIds.includes(ankunft.employeeId)
    if (passt) letzte.employeeIds.push(ankunft.employeeId)
    else trips.push({ dateKey: ankunft.dateKey, startedAt: ankunft.at, employeeIds: [ankunft.employeeId] })
  }
  return trips
}

/** Kfz-Pauschale für eine Zahl von Anfahrten, auf Cent gerundet. */
export const siteTripFlatRateTotal = (tripCount: number, flatRateEur: number): number =>
  Math.round(Math.max(0, tripCount) * Math.max(0, flatRateEur || 0) * 100) / 100
