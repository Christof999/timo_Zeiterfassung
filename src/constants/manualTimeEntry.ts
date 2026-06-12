/**
 * Früher: ausgewählte Benutzer durften Stempelsätze nachtragen.
 * Für diese App-Konfiguration ist das deaktiviert – kein Mitarbeiter darf Stempelsätze nachstempeln.
 */
export const MANUAL_TIME_ENTRY_USERNAMES = [] as const

export function canAddManualTimeEntries(_username: string | undefined | null): boolean {
  return false
}
