import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataService } from './services/dataService'
import Login from './components/Login'
import TimeTracking from './components/TimeTracking'
import VacationRequests from './components/VacationRequests'
import AdminLogin from './components/admin/AdminLogin'
import AdminDashboard from './components/admin/AdminDashboard'
import SplashScreen from './components/SplashScreen'
import OnboardingScreen from './components/OnboardingScreen'
import ToastContainer from './components/ToastContainer'
import { ONBOARDING_STORAGE_KEY } from './constants/onboarding'
import './styles/App.css'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [showSplash, setShowSplash] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    // Initialize Firebase - DataService initializes itself
    // Just ensure auth is ready
    DataService.authReady

    // Show splash screen for minimum 2.5 seconds
    const splashTimer = setTimeout(() => {
      setShowSplash(false)
      setIsLoading(false)
    }, 2500)

    return () => clearTimeout(splashTimer)
  }, [])

  if (showSplash) {
    return <SplashScreen />
  }

  if (isLoading) {
    return <div className="loading">Lade...</div>
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinished={() => setShowOnboarding(false)} />
  }

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/time-tracking" element={<TimeTracking />} />
        <Route path="/vacation" element={<VacationRequests />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

