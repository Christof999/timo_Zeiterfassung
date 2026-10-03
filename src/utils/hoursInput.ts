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

/**
 * Getrennte Felder „Stunden" und „Minuten" → Minuten. Ungültig → null.
 *
 * Für die Abrechnungsmeldung des Mitarbeiters. Ein einzelnes Feld war dort
 * mehrdeutig: die App zeigt „152:40", die Zifferntastatur des Handys hat aber
 * nur ein Komma – und „152,40" wurde als 152,4 Std = 152:24 gelesen, der Rest
 * wanderte unbemerkt aufs Überstundenkonto. Zwei reine Ziffernfelder lassen
 * diese Lesart gar nicht erst zu.
 *
 * Die Stunden müssen dastehen (0 ist eine bewusste Angabe), leere Minuten
 * zählen als 0.
 */
export const minutesFromHourMinuteFields = (hours: string, minutes: string): number | null => {
  const std = (hours || '').trim()
  const min = (minutes || '').trim()
  if (!/^\d{1,4}$/.test(std) || !/^\d{0,2}$/.test(min)) return null
  const minuten = min === '' ? 0 : Number(min)
  if (minuten > 59) return null
  return Number(std) * 60 + minuten
}
