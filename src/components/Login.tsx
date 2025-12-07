import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import { toast } from './ToastContainer'
import '../styles/Login.css'

const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Prüfe, ob bereits ein Benutzer angemeldet ist
    const checkLoggedIn = async () => {
      const currentUser = await DataService.getCurrentUser()
      if (currentUser && currentUser.id) {
        navigate('/time-tracking')
      }
    }
    checkLoggedIn()
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const user = await DataService.authenticateEmployee(username.trim(), password)
      
      if (user && user.id) {
        DataService.setCurrentUser(user)
        navigate('/time-tracking')
      } else {
        const errorMsg = 'Ungültiger Benutzername oder Passwort!'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = 'Bei der Anmeldung ist ein Fehler aufgetreten: ' + err.message
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <header className="login-header">
        <div className="logo">
          <img 
            src="https://anfragenmanager.s3.eu-central-1.amazonaws.com/Logo_Lauffer_RGB.png" 
            alt="Lauffer Logo" 
            className="logo-image"
          />
          <h1>Lauffer Zeiterfassung</h1>
          <p>Gartenbau • Erdbau • Natursteinhandel</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>React Version</p>
        </div>
      </header>

      <main className="login-main">
        <div className="login-section">
          <h2>Anmeldung</h2>
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="username">Benutzername:</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Passwort:</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
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
          
          <p className="admin-link">
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="admin-link-btn"
            >
              Admin-Bereich
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}

export default Login

