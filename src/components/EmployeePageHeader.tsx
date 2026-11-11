import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Employee } from '../types'
import { APP_DISPLAY_NAME } from '../constants/appBranding'
import { getEmployeeDisplayName } from '../utils/employeeDisplayName'
import EmployeeAvatar from './EmployeeAvatar'
import ThemeToggle from './ThemeToggle'

import '../styles/EmployeePages.css'

/** Gemeinsame Kopfleiste der Mitarbeiter-Unterseiten, passend zur Zeiterfassung. */
export default function EmployeePageHeader({ title, employee, back = { to: '/time-tracking' }, children }: {
  title: string
  employee?: Employee | null
  back?: { to: string } | { onClick: () => void }
  children?: ReactNode
}) {
  return <header className="employee-page-header">
    <div className="employee-page-bar">
      {'to' in back
        ? <Link to={back.to} className="employee-back" aria-label="Zurück"><span aria-hidden="true">←</span></Link>
        : <button type="button" className="employee-back" onClick={back.onClick} aria-label="Zurück"><span aria-hidden="true">←</span></button>}
      <img src="/brand-logo.png" className="employee-page-logo" alt="Firmenlogo" />
      <div className="employee-page-title"><p>{APP_DISPLAY_NAME}</p><h1>{title}</h1></div>
      {employee && <EmployeeAvatar name={getEmployeeDisplayName(employee)} photo={employee.profileImage} />}
      <ThemeToggle variant="icon" />
    </div>
    {children && <div className="employee-page-actions">{children}</div>}
  </header>
}
