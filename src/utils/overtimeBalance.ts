/**
 * Rechenkern der Stunden-Abrechnung – bewusst ohne Firebase-Abhängigkeit,
 * damit die Kontoführung isoliert testbar bleibt.
 */

/** Ein Dokument je Mitarbeiter und Monat – der Schlüssel verhindert Doppeleinträge. */
export const overtimeSettlementDocId = (employeeId: string, month: string): string =>
  `${employeeId}_${month}`

/**
 * Was ein Monat zum Überstundenkonto beiträgt: geleistete minus abgerechnete
 * Stunden.
 *
 * Bewusst ohne Untergrenze – der Wert darf negativ werden. Wer 180 Std leistet
 * und 190 abrechnen lässt, holt sich die fehlenden 10 Std aus dem
 * Überstundenkonto, lässt sie sich also auszahlen.
 */
export const contributionForMonth = (workedMinutes: number, settledMinutes: number): number =>
  workedMinutes - settledMinutes

/**
 * Beitrag eines bereits gespeicherten Eintrags zum Konto.
 *
 * Einträge aus dem alten Modell haben kein `workedMinutes`; dort wurden die
 * gemeldeten Minuten vom Konto **abgezogen**. Ihr Beitrag ist deshalb negativ –
 * nur so hebt eine Korrektur die alte Buchung sauber wieder auf.
 */
export const previousContribution = (
  previous: { minutes: number; workedMinutes?: number } | null
): number => {
  if (!previous) return 0
  const settled = Number(previous.minutes) || 0
  if (typeof previous.workedMinutes === 'number' && Number.isFinite(previous.workedMinutes)) {
    return contributionForMonth(previous.workedMinutes, settled)
  }
  return -settled
}

/**
 * Höchstens abrechenbare Minuten: geleistete Stunden plus das, was auf dem
 * Konto liegt. Ein bereits gespeicherter Beitrag desselben Monats steckt schon
 * im Kontostand und wird deshalb herausgerechnet.
 */
export const maxSettleableMinutes = (
  balanceMinutes: number,
  previous: { minutes: number; workedMinutes?: number } | null,
  workedMinutes: number
): number => Math.max(0, workedMinutes + balanceMinutes - previousContribution(previous))

/**
 * Neuer Kontostand nach dem Speichern eines Monatswerts. Verrechnet wird nur
 * die Differenz zum bisherigen Beitrag desselben Monats, damit Korrekturen das
 * Konto nicht mehrfach bewegen.
 *
 * @returns der neue Kontostand oder null, wenn er negativ würde
 */
export const nextBalanceForSettlement = (
  balanceMinutes: number,
  previous: { minutes: number; workedMinutes?: number } | null,
  workedMinutes: number,
  settledMinutes: number
): number | null => {
  const delta = contributionForMonth(workedMinutes, settledMinutes) - previousContribution(previous)
  const next = balanceMinutes + delta
  return next < 0 ? null : next
}
