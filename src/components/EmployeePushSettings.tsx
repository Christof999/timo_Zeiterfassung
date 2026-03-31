import { useState, useEffect } from 'react'
import { pushNotificationService } from '../services/pushNotificationService'
import type { Employee } from '../types'
import { toast } from './ToastContainer'
import '../styles/NavigationMenu.css'

interface EmployeePushSettingsProps {
  employee: Employee
  renderAsPage?: boolean
}

const STORAGE_KEY = 'lauffer_employee_push_panel_open'

const EmployeePushSettings: React.FC<EmployeePushSettingsProps> = ({
  employee,
  renderAsPage = false
}) => {
  const [isPushLoading, setIsPushLoading] = useState(true)
  const [isPushSupported, setIsPushSupported] = useState(false)
  const [pushSupportReason, setPushSupportReason] = useState<string | null>(null)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [isStandaloneMode, setIsStandaloneMode] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [hasPushSubscription, setHasPushSubscription] = useState(false)
  const [isEnablingPush, setIsEnablingPush] = useState(false)
  const [isDisablingPush, setIsDisablingPush] = useState(false)
  const [isTestingPush, setIsTestingPush] = useState(false)
  const [isPushPanelOpen, setIsPushPanelOpen] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? saved === 'true' : renderAsPage
  })

  const refreshPushStatus = async () => {
    setIsPushLoading(true)
    try {
      const supportState = pushNotificationService.getSupportState()
      setIsPushSupported(supportState.isSupported)
      setPushSupportReason(supportState.reason || null)
      setIsIosDevice(supportState.isIos)
      setIsStandaloneMode(supportState.isStandalone)
      setNotificationPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default')

      if (!supportState.isSupported) {
        setHasPushSubscription(false)
        return
      }

      const existingSubscription = await pushNotificationService.getCurrentSubscription()
      setHasPushSubscription(!!existingSubscription)
    } catch (error) {
      console.error('Fehler beim Laden des Push-Status:', error)
      setHasPushSubscription(false)
    } finally {
      setIsPushLoading(false)
    }
  }

  useEffect(() => {
    refreshPushStatus()
  }, [employee.id])

  const handleEnablePush = async () => {
    if (!employee.id) return
    setIsEnablingPush(true)
    try {
      await pushNotificationService.requestAndSaveSubscription(
        {
          id: employee.id,
          username: employee.username,
          name: employee.name || `${employee.firstName} ${employee.lastName}`
        },
        'employee'
      )
      toast.success('Push-Benachrichtigungen wurden aktiviert.')
      await refreshPushStatus()
    } catch (error: any) {
      toast.error(error?.message || 'Push konnte nicht aktiviert werden.')
    } finally {
      setIsEnablingPush(false)
    }
  }

  const handleDisablePush = async () => {
    setIsDisablingPush(true)
    try {
      await pushNotificationService.disableSubscription('employee')
      toast.success('Push-Benachrichtigungen wurden deaktiviert.')
      await refreshPushStatus()
    } catch (error: any) {
      toast.error(error?.message || 'Push konnte nicht deaktiviert werden.')
    } finally {
      setIsDisablingPush(false)
    }
  }

  const handleLocalPushTest = async () => {
    setIsTestingPush(true)
    try {
      await pushNotificationService.showLocalTestNotification('/vacation')
      toast.success('Lokale Test-Benachrichtigung wurde ausgelöst.')
    } catch (error: any) {
      toast.error(error?.message || 'Test-Benachrichtigung fehlgeschlagen.')
    } finally {
      setIsTestingPush(false)
    }
  }

  const togglePushPanel = () => {
    setIsPushPanelOpen((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <section className={`admin-push-card ${renderAsPage ? 'admin-push-card-page' : ''}`}>
      <button
        type="button"
        className="admin-push-toggle"
        onClick={togglePushPanel}
        aria-expanded={isPushPanelOpen}
        aria-controls="employee-push-content"
      >
        <div className="admin-push-header">
          <div>
            <h3>Benachrichtigungen bei Genehmigung</h3>
            <p>Push erhalten, wenn ein Urlaubsantrag genehmigt wurde.</p>
          </div>
          <div className="admin-push-toggle-right">
            <span className={`admin-push-badge ${hasPushSubscription ? 'active' : 'inactive'}`}>
              {hasPushSubscription ? 'Aktiv' : 'Nicht aktiv'}
            </span>
            <span className={`admin-push-chevron ${isPushPanelOpen ? 'open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </div>
        </div>
      </button>

      {isPushPanelOpen && (
        <div id="employee-push-content">
          {isPushLoading ? (
            <p className="admin-push-info">Push-Status wird geladen…</p>
          ) : (
            <>
              {isPushSupported ? (
                <p className="admin-push-info">
                  Berechtigung: <strong>{notificationPermission}</strong>
                </p>
              ) : (
                <p className="admin-push-warning">{pushSupportReason || 'Push wird nicht unterstützt.'}</p>
              )}

              {isIosDevice && !isStandaloneMode && (
                <p className="admin-push-warning">
                  Hinweis für iPhone: Safari öffnen → Teilen → „Zum Home-Bildschirm“, dann dort erneut anmelden und Push
                  aktivieren.
                </p>
              )}

              <div className="admin-push-actions">
                <button
                  type="button"
                  className="admin-push-btn primary"
                  disabled={!isPushSupported || isEnablingPush}
                  onClick={handleEnablePush}
                >
                  {isEnablingPush ? 'Aktiviere…' : 'Push aktivieren'}
                </button>

                <button
                  type="button"
                  className="admin-push-btn secondary"
                  disabled={!hasPushSubscription || isDisablingPush}
                  onClick={handleDisablePush}
                >
                  {isDisablingPush ? 'Deaktiviere…' : 'Push deaktivieren'}
                </button>

                <button
                  type="button"
                  className="admin-push-btn secondary"
                  disabled={!hasPushSubscription || notificationPermission !== 'granted' || isTestingPush}
                  onClick={handleLocalPushTest}
                >
                  {isTestingPush ? 'Teste…' : 'Test-Benachrichtigung'}
                </button>

                <button
                  type="button"
                  className="admin-push-btn ghost"
                  disabled={isPushLoading}
                  onClick={refreshPushStatus}
                >
                  Status aktualisieren
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default EmployeePushSettings
