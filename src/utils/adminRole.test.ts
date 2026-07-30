import { describe, it, expect } from 'vitest'
import { allowedAdminTabs, isTabAllowedForRole, resolveAdminRole } from './adminRole'

describe('Admin-Rollen', () => {
  it('gibt ohne Angabe vollen Zugriff', () => {
    expect(resolveAdminRole({ username: 'timo' })).toBe('full')
    expect(resolveAdminRole(null)).toBe('full')
    expect(resolveAdminRole(undefined)).toBe('full')
  })

  it('erkennt den bestehenden Petra-Zugang auch ohne gesetzte Rolle', () => {
    expect(resolveAdminRole({ username: 'petra' })).toBe('payroll')
    expect(resolveAdminRole({ username: 'Petra' })).toBe('payroll')
    expect(resolveAdminRole({ username: '  PETRA  ' })).toBe('payroll')
  })

  it('lässt die hinterlegte Rolle immer gewinnen', () => {
    // Petra kann ausdrücklich vollen Zugriff bekommen …
    expect(resolveAdminRole({ username: 'petra', adminRole: 'full' })).toBe('full')
    // … und jeder andere kann eingeschränkt werden.
    expect(resolveAdminRole({ username: 'timo', adminRole: 'payroll' })).toBe('payroll')
  })
})

describe('Sichtbare Bereiche', () => {
  it('lässt den vollen Zugriff überall hin', () => {
    for (const tab of ['overview', 'projects', 'costing', 'reports', 'employees', 'diagnostics']) {
      expect(isTabAllowedForRole('full', tab)).toBe(true)
    }
  })

  it('beschränkt die Lohnabrechnung auf Bericht, Mitarbeiter und Urlaub', () => {
    expect(allowedAdminTabs('payroll')).toEqual(['reports', 'employees', 'vacation'])
    expect(isTabAllowedForRole('payroll', 'reports')).toBe(true)
    expect(isTabAllowedForRole('payroll', 'employees')).toBe(true)
    // Urlaub ist dabei, weil dort die Krankmeldungen erfasst werden.
    expect(isTabAllowedForRole('payroll', 'vacation')).toBe(true)
  })

  it('sperrt Dashboard, Projekte und Nachkalkulation', () => {
    for (const tab of [
      'overview',
      'notifications',
      'projects',
      'projectsArchived',
      'costing',
      'customers',
      'material',
      'hero',
      'diagnostics'
    ]) {
      expect(isTabAllowedForRole('payroll', tab)).toBe(false)
    }
  })
})
