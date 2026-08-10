/**
 * Stunden-Ein- und -Ausgabe an einer Stelle. Bericht (Admin) und
 * Überstunden-Verrechnung (Mitarbeiter) müssen "8,5" und "8:30" identisch
 * verstehen – sonst rechnen die beiden Seiten am selben Konto unterschiedlich.
 */

export const minutesToHoursLabel = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

/**
 * Dezimalstunden für die Lohnbuchhaltung: 8:30 → „8,50".
 *
 * Der Baulohn rechnet in Dezimalstunden, nicht in Stunden:Minuten – bisher hat
 * die Kanzlei jede Zeile von Hand umgerechnet. Zwei Nachkommastellen, damit
 * Viertelstunden aufgehen; deutsches Komma, weil der Beleg deutsch ist.
 */
export const minutesToDecimalHours = (totalMinutes: number): string =>
  (Math.round((totalMinutes / 60) * 100) / 100).toFixed(2).replace('.', ',')

/** "8:30", "8,5" oder "510" (Minuten-frei) → Minuten. Ungültig → null. */
export const parseHoursMinutesInput = (value: string): number | null => {
  const trimmed = (value || '').trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':')
    const hours = Number(h)
    const minutes = Number(m)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    if (hours < 0 || minutes < 0 || minutes > 59) return null
    return Math.round(hours * 60 + minutes)
  }
  const decimal = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(decimal) || decimal < 0) return null
  return Math.round(decimal * 60)
}
