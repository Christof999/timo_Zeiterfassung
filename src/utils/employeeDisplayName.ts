import type { Employee } from '../types'

/** Anzeigename auch wenn nur `name` oder `username` gesetzt ist (häufig ohne firstName/lastName). */
export function getEmployeeDisplayName(employee: Employee | null | undefined): string {
  if (!employee) return ''
  const first = employee.firstName?.trim()
  const last = employee.lastName?.trim()
  const combined = [first, last].filter(Boolean).join(' ').trim()
  if (combined) return combined
  const name = employee.name?.trim()
  if (name) return name
  const username = employee.username?.trim()
  if (username) return username
  return 'Mitarbeiter'
}
