import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataService } from './services/dataService'
import Login from './components/Login'
import TimeTracking from './components/TimeTracking'
import VacationRequests from './components/VacationRequests'
import OvertimeSettlements from './components/OvertimeSettlements'
import SplashScreen from './components/SplashScreen'
import OnboardingScreen from './components/OnboardingScreen'
import ToastContainer from './components/ToastContainer'
import OfflineUploadIndicator from './components/OfflineUploadIndicator'
import { offlineUploadQueue } from './services/offlineUploadQueue'
import { ONBOARDING_STORAGE_KEY } from './constants/onboarding'
import './styles/App.css'

// Admin-Bereich lazy laden: Mitarbeiter auf der Baustelle müssen Dashboard,
// Nachkalkulation und KI-Chat nicht mit herunterladen.
const AdminLogin = lazy(() => import('./components/admin/AdminLogin'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))

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
    void DataService.authReady

    // Offline-Upload-Queue starten: reicht zwischengespeicherte Baustellenfotos nach,
    // sobald wieder Netz da ist (auch nach App-Neustart).
    offlineUploadQueue.init()

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
      <OfflineUploadIndicator />
      <Suspense fallback={<div className="loading">Lade...</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/time-tracking" element={<TimeTracking />} />
          <Route path="/vacation" element={<VacationRequests />} />
          <Route path="/overtime" element={<OvertimeSettlements />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App

