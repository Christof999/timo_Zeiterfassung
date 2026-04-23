import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../../services/dataService'
import { pushNotificationService } from '../../services/pushNotificationService'
import { toast } from '../ToastContainer'
import ThemeToggle from '../ThemeToggle'
import OverviewTab from './tabs/OverviewTab'
import EmployeesTab from './tabs/EmployeesTab'
import ProjectsTab from './tabs/ProjectsTab'
import VehiclesTab from './tabs/VehiclesTab'
import ReportsTab from './tabs/ReportsTab'
import VacationTab from './tabs/VacationTab'
import { APP_DISPLAY_NAME } from '../../constants/appBranding'
import '../../styles/AdminDashboard.css'

type TabType =
  | 'overview'
  | 'notifications'
  | 'employees'
  | 'projects'
  | 'projectsArchived'
  | 'vehicles'
  | 'costing'
  | 'reports'
  | 'vacation'

const AdminDashboard: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>('overview')
  const [currentAdmin, setCurrentAdmin] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
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
    const saved = localStorage.getItem('lauffer_admin_push_panel_open')
    return saved ? saved === 'true' : false
  })
  const navigate = useNavigate()

  useEffect(() => {
    const checkAdmin = async () => {
      const admin = await DataService.getCurrentAdmin()
      if (!admin || !admin.isAdmin) {
        navigate('/admin/login')
        return
      }
      setCurrentAdmin(admin)
      await refreshPushStatus()
      setIsLoading(false)
    }
    checkAdmin()
  }, [navigate])

  useEffect(() => {
    if (!hasPushSubscription && currentTab === 'notifications') {
      setCurrentTab('overview')
    }
  }, [hasPushSubscription, currentTab])

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

  const handleEnablePush = async () => {
    if (!currentAdmin) return
    setIsEnablingPush(true)
    try {
      await pushNotificationService.requestAndSaveSubscription({
        id: currentAdmin.id,
        username: currentAdmin.username,
        name: currentAdmin.name
      })
      toast.success('Push-Benachrichtigungen wurden aktiviert.')
      await refreshPushStatus()
      setCurrentTab('notifications')
    } catch (error: any) {
      toast.error(error?.message || 'Push konnte nicht aktiviert werden.')
    } finally {
      setIsEnablingPush(false)
    }
  }

  const handleDisablePush = async () => {
    setIsDisablingPush(true)
    try {
      await pushNotificationService.disableSubscription()
      toast.success('Push-Benachrichtigungen wurden deaktiviert.')
      await refreshPushStatus()
      if (currentTab === 'notifications') {
        setCurrentTab('overview')
      }
    } catch (error: any) {
      toast.error(error?.message || 'Push konnte nicht deaktiviert werden.')
    } finally {
      setIsDisablingPush(false)
    }
  }

  const handleLocalPushTest = async () => {
    setIsTestingPush(true)
    try {
      await pushNotificationService.showLocalTestNotification()
      toast.success('Lokale Test-Benachrichtigung wurde ausgelöst.')
    } catch (error: any) {
      toast.error(error?.message || 'Test-Benachrichtigung fehlgeschlagen.')
    } finally {
      setIsTestingPush(false)
    }
  }

  const handleLogout = () => {
    DataService.clearCurrentAdmin()
    toast.success('Erfolgreich abgemeldet')
    navigate('/admin/login')
  }

  const togglePushPanel = () => {
    setIsPushPanelOpen((prev) => {
      const next = !prev
      localStorage.setItem('lauffer_admin_push_panel_open', String(next))
      return next
    })
  }

  if (isLoading) {
    return <div className="loading">Lade...</div>
  }

  if (!currentAdmin) {
    return null
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'Übersicht' },
    ...(hasPushSubscription || currentTab === 'notifications'
      ? [{ id: 'notifications' as TabType, label: 'Benachrichtigungen' }]
      : []),
    { id: 'employees' as TabType, label: 'Mitarbeiter' },
    { id: 'projects' as TabType, label: 'Projekte' },
    { id: 'projectsArchived' as TabType, label: 'Archivierte Projekte' },
    { id: 'vehicles' as TabType, label: 'Fahrzeuge' },
    { id: 'costing' as TabType, label: 'Nachkalkulation' },
    { id: 'vacation' as TabType, label: 'Urlaub' },
    { id: 'reports' as TabType, label: 'Zeiterfassungsbericht' }
  ]

  const renderPushSettings = (renderAsPage = false) => (
    <section className={`admin-push-card ${renderAsPage ? 'admin-push-card-page' : ''}`}>
      <button
        type="button"
        className="admin-push-toggle"
        onClick={togglePushPanel}
        aria-expanded={isPushPanelOpen}
        aria-controls="admin-push-content"
      >
        <div className="admin-push-header">
          <div>
            <h3>iPhone Homescreen-Benachrichtigungen</h3>
            <p>Aktiviere Push für dieses Admin-Gerät.</p>
          </div>
          <div className="admin-push-toggle-right">
            <span className={`admin-push-badge ${hasPushSubscription ? 'active' : 'inactive'}`}>
              {hasPushSubscription ? 'Aktiv' : 'Nicht aktiv'}
            </span>
            <span className={`admin-push-chevron ${isPushPanelOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </div>
      </button>

      {isPushPanelOpen && (
        <div id="admin-push-content">
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
                  Hinweis für iPhone: Safari öffnen → Teilen → „Zum Home-Bildschirm“, dann dort erneut anmelden und Push aktivieren.
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

  return (
    <div className="admin-dashboard-container">
      <header className="admin-dashboard-header">
        <div className="admin-header-start">
          <button 
            className="admin-nav-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Navigation umschalten"
          >
            <span className="admin-hamburger-line"></span>
            <span className="admin-hamburger-line"></span>
            <span className="admin-hamburger-line"></span>
          </button>
        </div>
        <div className="admin-logo">
          <img 
            src="/brand-logo.png" 
            alt="Logo" 
            className="admin-logo-image"
          />
          <h1>{APP_DISPLAY_NAME}</h1>
          <p className="admin-logo-subtitle">Admin Panel</p>
        </div>
        <div className="admin-header-controls">
          <div className="admin-controls">
            <ThemeToggle variant="icon" />
            <span className="admin-name">{currentAdmin.name || 'Administrator'}</span>
            <button onClick={handleLogout} className="btn secondary-btn">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="admin-dashboard-main">
        <nav className={`dashboard-tabs ${isMenuOpen ? 'open' : ''}`}>
          <button 
            className="admin-menu-close"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Menü schließen"
          >
            ×
          </button>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${currentTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab(tab.id)
                setIsMenuOpen(false)
              }}
            >
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="dashboard-content">
          {currentTab === 'overview' && !hasPushSubscription && renderPushSettings(false)}
          {currentTab === 'notifications' && renderPushSettings(true)}

          {currentTab === 'overview' && <OverviewTab />}
          {currentTab === 'employees' && <EmployeesTab />}
          {currentTab === 'projects' && <ProjectsTab variant="active" />}
          {currentTab === 'projectsArchived' && <ProjectsTab variant="archived" />}
          {currentTab === 'vehicles' && <VehiclesTab />}
          {currentTab === 'costing' && <ReportsTab defaultReportType="project" allowedReportTypes={['project']} />}
          {currentTab === 'vacation' && <VacationTab />}
          {currentTab === 'reports' && <ReportsTab defaultReportType="employee" allowedReportTypes={['employee']} />}
        </div>
      </main>
    </div>
  )
}

export default AdminDashboard

