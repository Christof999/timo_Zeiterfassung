/** Benutzer, die Stempelzeiten für sich und andere nachtragen dürfen */
export const MANUAL_TIME_ENTRY_USERNAMES = ['mdorner', 'plauffer', 'csoergel'] as const

export function canAddManualTimeEntries(username: string | undefined | null): boolean {
  if (!username) return false
  const u = username.toLowerCase().trim()
  return (MANUAL_TIME_ENTRY_USERNAMES as readonly string[]).includes(u)
}
