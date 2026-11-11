import { useState } from 'react'
import { getEmployeeInitials } from '../utils/employeeDisplayName'
import '../styles/EmployeeAvatar.css'

export default function EmployeeAvatar({ name, photo, className = '' }: { name: string; photo?: string; className?: string }) {
  const [failed, setFailed] = useState<string>()
  return <span className={`employee-avatar ${className}`} aria-hidden="true">
    {photo && failed !== photo
      ? <img src={photo} alt="" onError={() => setFailed(photo)} />
      : getEmployeeInitials(name)}
  </span>
}
