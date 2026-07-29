import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { AdminRole, Employee } from '../../types'
import { authReady, postWithIdToken } from './shared'
import { resolveAdminRole } from '../../utils/adminRole'

// Mitarbeiter- und Admin-Session (localStorage) sowie Login-Prüfung.
//
// SICHERHEITSHINWEIS: Login vergleicht Klartext-Passwörter aus Firestore im
// Client und die Admin-Session ist nur ein localStorage-Flag. Die Umstellung
// auf echte Firebase-Auth ist in AUTH-MIGRATION.md vorbereitet (zurückgestellt).

export interface AdminSession {
  id?: string
  username: string
  name: string
  isAdmin: true
  /** Umfang der Rechte; ohne Angabe gilt der volle Zugriff. */
  adminRole?: AdminRole
}

export function getCurrentUser(): Employee | null {
  try {
    const savedUser = localStorage.getItem('lauffer_current_user')
    return savedUser ? JSON.parse(savedUser) : null
  } catch (error) {
    console.error('Fehler beim Laden des Benutzers:', error)
    return null
  }
}

export function setCurrentUser(user: Employee | null): void {
  if (user) {
    const { password: _password, ...safeUserData } = user
    localStorage.setItem('lauffer_current_user', JSON.stringify(safeUserData))
  } else {
    localStorage.removeItem('lauffer_current_user')
  }
}

export function clearCurrentUser(): void {
  localStorage.removeItem('lauffer_current_user')
}

export async function authenticateEmployee(
  username: string,
  password: string
): Promise<Employee | null> {
  await authReady
  try {
    const employeesRef = collection(db, 'employees')
    const q = query(employeesRef, where('username', '==', username), limit(1))
    const snapshot = await getDocs(q)

    if (!snapshot.empty) {
      const doc = snapshot.docs[0]
      const employee = { id: doc.id, ...doc.data() } as Employee

      if (employee.password === password && employee.status === 'active') {
        const { password: _password, ...employeeData } = employee
        return employeeData as Employee
      }
    }
    return null
  } catch (error) {
    console.error('Fehler bei der Authentifizierung:', error)
    return null
  }
}

export function getCurrentAdmin(): AdminSession | null {
  try {
    let savedAdmin = localStorage.getItem('lauffer_admin_user')
    if (!savedAdmin) {
      savedAdmin = localStorage.getItem('lauffer_current_admin')
    }
    return savedAdmin ? JSON.parse(savedAdmin) : null
  } catch (error) {
    console.error('Fehler beim Laden des Admins:', error)
    return null
  }
}

export function setCurrentAdmin(admin: AdminSession | null): void {
  if (admin) {
    localStorage.setItem('lauffer_admin_user', JSON.stringify(admin))
    localStorage.setItem('lauffer_current_admin', JSON.stringify(admin))
  } else {
    localStorage.removeItem('lauffer_admin_user')
    localStorage.removeItem('lauffer_current_admin')
  }
}

export function clearCurrentAdmin(): void {
  localStorage.removeItem('lauffer_admin_user')
  localStorage.removeItem('lauffer_current_admin')
}

export async function authenticateAdmin(
  username: string,
  password: string
): Promise<AdminSession | null> {
  await authReady
  try {
    // Einfache Admin-Authentifizierung (wie in der alten Version)
    if (username === 'admin' && password === 'admin123') {
      const admin: AdminSession = { username: 'admin', name: 'Administrator', isAdmin: true }
      setCurrentAdmin(admin)
      return admin
    }

    // Prüfe auch ob es ein Admin-Mitarbeiter ist
    const employeesRef = collection(db, 'employees')
    const q = query(employeesRef, where('username', '==', username), limit(1))
    const snapshot = await getDocs(q)

    if (!snapshot.empty) {
      const doc = snapshot.docs[0]
      const employee = { id: doc.id, ...doc.data() } as Employee

      if (employee.password === password && employee.isAdmin === true) {
        const admin: AdminSession = {
          id: employee.id,
          username: employee.username || username,
          name: employee.name || `${employee.firstName} ${employee.lastName}`,
          isAdmin: true,
          adminRole: resolveAdminRole(employee)
        }
        setCurrentAdmin(admin)
        return admin
      }
    }

    return null
  } catch (error) {
    console.error('Fehler bei der Admin-Authentifizierung:', error)
    return null
  }
}

export async function saveAdminPushSubscription(
  subscription: PushSubscriptionJSON,
  admin: { id?: string; username?: string; name?: string }
): Promise<void> {
  if (!subscription.endpoint) {
    throw new Error('Push-Subscription enthält keinen Endpoint')
  }

  await authReady
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  await postWithIdToken('/api/push/subscription', {
    action: 'upsert',
    subscription,
    admin,
    permission: Notification.permission,
    isStandalone,
    userAgent: navigator.userAgent
  })
}

export async function removeAdminPushSubscription(endpoint: string): Promise<void> {
  if (!endpoint) {
    return
  }
  await authReady
  await postWithIdToken('/api/push/subscription', {
    action: 'disable',
    endpoint
  })
}
