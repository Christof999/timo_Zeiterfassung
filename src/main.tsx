import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initThemeFromStorage } from './utils/theme'
import './styles/index.css'

initThemeFromStorage()

// Service Worker für PWA/Push registrieren
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => {
        console.log('✅ Service Worker registriert')
      })
      .catch((error) => {
        console.error('❌ Service Worker Registrierung fehlgeschlagen:', error)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

