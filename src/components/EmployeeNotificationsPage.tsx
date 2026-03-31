import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee } from '../types'
import EmployeePushSettings from './EmployeePushSettings'
import { toast } from './ToastContainer'
import '../styles/VacationRequests.css'

const EmployeeNotificationsPage: React.FC = () => {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const user = await DataService.getCurrentUser()
        if (!user?.id) {
          toast.error('Bitte melden Sie sich an')
          navigate('/login')
          return
        }
        setCurrentUser(user)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [navigate])

  if (isLoading || !currentUser) {
    return (
      <div className="vacation-container">
        <div className="loading">Lade...</div>
      </div>
    )
  }

  return (
    <div className="vacation-container">
      <header className="vacation-header">
        <button type="button" onClick={() => navigate('/time-tracking')} className="back-btn">
          Zurück
        </button>
        <h1>Benachrichtigungen</h1>
      </header>

      <EmployeePushSettings employee={currentUser} renderAsPage />
    </div>
  )
}

export default EmployeeNotificationsPage
