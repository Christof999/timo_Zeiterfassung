import type { AdminRole, Employee } from '../types'

// Rechte im Admin-Bereich.
//
// 'full'    – der komplette Admin-Bereich wie bisher.
// 'payroll' – nur das, was für die Lohnabrechnung nötig ist:
//             Zeiterfassungsbericht und Mitarbeiter-Stammdaten.
//             Kein Dashboard, keine Projekte, keine Nachkalkulation.

/**
 * Benutzernamen, die ohne ausdrücklich gesetzte Rolle als Lohnbuchhaltung
 * gelten. Damit greift die Einschränkung sofort, ohne dass der bestehende
 * Zugang erst von Hand umgestellt werden muss. Eine am Mitarbeiter
 * hinterlegte Rolle hat immer Vorrang.
 */
const PAYROLL_USERNAMES = ['petra']

export const resolveAdminRole = (
  admin: Pick<Employee, 'username' | 'adminRole'> | null | undefined
): AdminRole => {
  if (!admin) return 'full'
  if (admin.adminRole === 'payroll' || admin.adminRole === 'full') return admin.adminRole
  const username = (admin.username || '').trim().toLowerCase()
  return PAYROLL_USERNAMES.includes(username) ? 'payroll' : 'full'
}

/**
 * Tabs, die eine Rolle im Admin-Bereich öffnen darf.
 *
 * 'vacation' ist für die Lohnabrechnung dabei, weil dort die Krankmeldungen
 * gepflegt werden — die Krankheitstage braucht sie für den Beleg.
 */
export const allowedAdminTabs = (role: AdminRole): string[] =>
  role === 'payroll' ? ['reports', 'reportsDatev', 'employees', 'vacation'] : []

export const isTabAllowedForRole = (role: AdminRole, tabId: string): boolean => {
  if (role === 'full') return true
  return allowedAdminTabs(role).includes(tabId)
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  full: 'Voller Zugriff',
  payroll: 'Nur Lohnabrechnung (Zeiterfassungsbericht, Mitarbeiter, Urlaub)'
}
