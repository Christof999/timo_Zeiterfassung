/**
 * Rechenkern der Überstunden-Verrechnung – bewusst ohne Firebase-Abhängigkeit,
 * damit die Kontoführung isoliert testbar bleibt.
 */

/** Ein Dokument je Mitarbeiter und Monat – der Schlüssel verhindert Doppeleinträge. */
export const overtimeSettlementDocId = (employeeId: string, month: string): string =>
  `${employeeId}_${month}`

/**
 * Kontostand nach einer Änderung des Monatswerts. Gebucht wird nur die
 * Differenz – der bereits verrechnete Teil ist längst abgezogen und steht für
 * eine Korrektur nach oben wieder zur Verfügung.
 *
 * @returns der neue Kontostand oder null, wenn das Konto nicht reicht
 */
export const nextBalanceForSettlement = (
  balanceMinutes: number,
  previousMinutes: number,
  wantedMinutes: number
): number | null => {
  const next = balanceMinutes - (wantedMinutes - previousMinutes)
  return next < 0 ? null : next
}
