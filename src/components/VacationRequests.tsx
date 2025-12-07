import React from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/VacationRequests.css'

const VacationRequests: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="vacation-requests-container">
      <header>
        <h1>Urlaubsanträge</h1>
        <button onClick={() => navigate('/time-tracking')} className="btn secondary-btn">
          Zurück
        </button>
      </header>
      <main>
        <p>Diese Funktion wird noch implementiert...</p>
      </main>
    </div>
  )
}

export default VacationRequests

