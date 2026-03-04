import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../../services/dataService'
import { toast } from '../ToastContainer'
import OverviewTab from './tabs/OverviewTab'
import EmployeesTab from './tabs/EmployeesTab'
import ProjectsTab from './tabs/ProjectsTab'
import VehiclesTab from './tabs/VehiclesTab'
import ReportsTab from './tabs/ReportsTab'
import VacationTab from './tabs/VacationTab'
import '../../styles/AdminDashboard.css'

type TabType = 'overview' | 'employees' | 'projects' | 'vehicles' | 'costing' | 'reports' | 'vacation'

const AdminDashboard: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>('overview')
  const [currentAdmin, setCurrentAdmin] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const checkAdmin = async () => {
      const admin = await DataService.getCurrentAdmin()
      if (!admin || !admin.isAdmin) {
        navigate('/admin/login')
        return
      }
      setCurrentAdmin(admin)
      setIsLoading(false)
    }
    checkAdmin()
  }, [navigate])

  const handleLogout = () => {
    DataService.clearCurrentAdmin()
    toast.success('Erfolgreich abgemeldet')
    navigate('/admin/login')
  }

  if (isLoading) {
    return <div className="loading">Lade...</div>
  }

  if (!currentAdmin) {
    return null
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'Übersicht' },
    { id: 'employees' as TabType, label: 'Mitarbeiter' },
    { id: 'projects' as TabType, label: 'Projekte' },
    { id: 'vehicles' as TabType, label: 'Fahrzeuge' },
    { id: 'costing' as TabType, label: 'Nachkalkulation' },
    { id: 'vacation' as TabType, label: 'Urlaub' },
    { id: 'reports' as TabType, label: 'Berichte' }
  ]

  return (
    <div className="admin-dashboard-container">
      <header className="admin-dashboard-header">
        <div className="admin-logo">
          <img 
            src="https://anfragenmanager.s3.eu-central-1.amazonaws.com/Logo_Lauffer_RGB.png" 
            alt="Lauffer Logo" 
            className="admin-logo-image"
          />
          <h1>Lauffer Zeiterfassung</h1>
          <p>Admin Panel</p>
        </div>
        <div className="admin-header-controls">
          <button 
            className="admin-nav-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Navigation umschalten"
          >
            <span className="admin-hamburger-line"></span>
            <span className="admin-hamburger-line"></span>
            <span className="admin-hamburger-line"></span>
          </button>
          <div className="admin-controls">
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
          {currentTab === 'overview' && <OverviewTab />}
          {currentTab === 'employees' && <EmployeesTab />}
          {currentTab === 'projects' && <ProjectsTab />}
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

