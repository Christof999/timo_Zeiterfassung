import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../../services/dataService'
import { toast } from '../ToastContainer'
import '../../styles/AdminLogin.css'

const AdminLogin: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Prüfe, ob bereits ein Admin angemeldet ist
    const checkLoggedIn = async () => {
      const currentAdmin = await DataService.getCurrentAdmin()
      if (currentAdmin && currentAdmin.isAdmin) {
        navigate('/admin/dashboard')
      }
    }
    checkLoggedIn()
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const admin = await DataService.authenticateAdmin(username.trim(), password)
      
      if (admin && admin.isAdmin) {
        DataService.setCurrentAdmin(admin)
        toast.success('Admin-Anmeldung erfolgreich!')
        navigate('/admin/dashboard')
      } else {
        const errorMsg = 'Ungültige Admin-Zugangsdaten!'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = 'Bei der Admin-Anmeldung ist ein Fehler aufgetreten: ' + err.message
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="admin-login-container">
      <header className="admin-login-header">
        <div className="logo">
          <img 
            src="https://anfragenmanager.s3.eu-central-1.amazonaws.com/Logo_Lauffer_RGB.png" 
            alt="Lauffer Logo" 
            className="logo-image"
          />
          <h1>Lauffer Zeiterfassung</h1>
          <p>Admin Panel</p>
        </div>
      </header>

      <main className="admin-login-main">
        <div className="admin-login-section">
          <h2>Admin Anmeldung</h2>
          <form onSubmit={handleSubmit} className="admin-login-form">
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="admin-username">Benutzername:</label>
              <input
                type="text"
                id="admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={isLoading}
                placeholder="admin"
              />
            </div>

            <div className="form-group">
              <label htmlFor="admin-password">Passwort:</label>
              <input
                type="password"
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
                placeholder="admin123"
              />
            </div>

            <button 
              type="submit" 
              className="btn primary-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>
          
          <p className="user-link">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="link-btn"
            >
              Zur Mitarbeiter-Ansicht
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}

export default AdminLogin

