/**
 * Abbildung Username -> synthetische Login-E-Mail für Firebase Auth.
 *
 * Mitarbeiter melden sich weiterhin nur mit ihrem Username an; intern wird
 * daraus eine E-Mail-Adresse gebildet (Firebase Auth verlangt E-Mail-Form,
 * aber kein echtes Postfach).
 *
 * WICHTIG: AUTH_EMAIL_DOMAIN muss exakt mit functions/index.js übereinstimmen.
 */
export const AUTH_EMAIL_DOMAIN = 'mitarbeiter.zeiterfassung-intern.de'

export function usernameToEmail(username: string): string {
  const normalized = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  return `${normalized}@${AUTH_EMAIL_DOMAIN}`
}
