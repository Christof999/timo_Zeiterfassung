// Glättung der Arbeitszeiten: Kommen-/Gehen-Zeiten werden kaufmännisch (auf/ab)
// auf das nächste 15-Minuten-Raster gerundet. Diese Rundung ist die einheitliche
// Basis für ALLE Stunden-, Lohn- und Überstundenberechnungen sowie Anzeigen.
// (Nicht verwendet für die laufende Live-Uhr / aktuelle Sitzungsdauer.)

export const TIME_ROUND_STEP_MINUTES = 15

/** Rundet eine Uhrzeit auf das nächste 15-Minuten-Raster (z. B. 15:39 → 15:45, 15:07 → 15:00). */
export function roundTimeToStep(date: Date): Date
export function roundTimeToStep(date: null | undefined): null
export function roundTimeToStep(date: Date | null | undefined): Date | null
export function roundTimeToStep(date: Date | null | undefined): Date | null {
  if (!date) return null
  const minutes = date.getHours() * 60 + date.getMinutes()
  const snapped = Math.round(minutes / TIME_ROUND_STEP_MINUTES) * TIME_ROUND_STEP_MINUTES
  const rounded = new Date(date)
  rounded.setHours(0, snapped, 0, 0)
  return rounded
}

/** Brutto-Dauer (Gehen − Kommen) in ms, beide Zeiten auf 15 Min gerundet. */
export function roundedSpanMs(clockIn: Date, clockOut: Date): number {
  return roundTimeToStep(clockOut).getTime() - roundTimeToStep(clockIn).getTime()
}
