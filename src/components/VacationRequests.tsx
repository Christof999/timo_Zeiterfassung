import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataService } from '../services/dataService'
import type { Employee, LeaveRequest } from '../types'
import { toast } from './ToastContainer'
import '../styles/VacationRequests.css'

const VacationRequests: React.FC = () => {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  
  // Formular-State
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'vacation' as LeaveRequest['type'],
    reason: ''
  })
  const [workingDays, setWorkingDays] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Arbeitstage berechnen wenn Datum sich ändert
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)
      if (end >= start) {
        const days = DataService.calculateWorkingDays(start, end)
        setWorkingDays(days)
      } else {
        setWorkingDays(0)
      }
    } else {
      setWorkingDays(0)
    }
  }, [formData.startDate, formData.endDate])

  const loadData = async () => {
    try {
      const user = await DataService.getCurrentUser()
      if (!user) {
        toast.error('Bitte melden Sie sich an')
        navigate('/login')
        return
      }
      setCurrentUser(user)

      const requests = await DataService.getLeaveRequestsByEmployee(user.id!)
      // Sortieren nach Erstellungsdatum (neueste zuerst)
      requests.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt)
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt)
        return dateB.getTime() - dateA.getTime()
      })
      setLeaveRequests(requests)
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Daten')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentUser) return
    
    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      toast.error('Das Enddatum muss nach dem Startdatum liegen')
      return
    }

    if (workingDays === 0) {
      toast.error('Der Zeitraum enthält keine Arbeitstage')
      return
    }

    setIsSubmitting(true)
    try {
      await DataService.createLeaveRequest({
        employeeId: currentUser.id!,
        employeeName: currentUser.name || `${currentUser.firstName} ${currentUser.lastName}`,
        startDate: new Date(formData.startDate),
        endDate: new Date(formData.endDate),
        type: formData.type,
        reason: formData.reason,
        workingDays
      })

      toast.success('Urlaubsantrag erfolgreich eingereicht!')
      setShowForm(false)
      setFormData({ startDate: '', endDate: '', type: 'vacation', reason: '' })
      loadData()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Antrag wirklich löschen?')) return
    
    try {
      await DataService.deleteLeaveRequest(id)
      toast.success('Antrag gelöscht')
      loadData()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    }
  }

  const getTypeLabel = (type: LeaveRequest['type']) => {
    switch (type) {
      case 'vacation': return 'Urlaub'
      case 'sick': return 'Krankheit'
      case 'special': return 'Sonderurlaub'
      case 'unpaid': return 'Unbezahlt'
      default: return type
    }
  }

  const getStatusBadge = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'pending':
        return <span className="status-badge pending">⏳ Ausstehend</span>
      case 'approved':
        return <span className="status-badge approved">✅ Genehmigt</span>
      case 'rejected':
        return <span className="status-badge rejected">❌ Abgelehnt</span>
      default:
        return <span className="status-badge">{status}</span>
    }
  }

  const formatDate = (date: any) => {
    if (!date) return '-'
    const d = date?.toDate?.() || new Date(date)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Urlaubskonto berechnen
  const vacationAccount = currentUser?.vacationDays || { total: 30, used: 0, year: new Date().getFullYear() }
  const remaining = (vacationAccount.total || 30) - (vacationAccount.used || 0)

  // Min-Datum für Datumseingaben (heute)
  const today = new Date().toISOString().split('T')[0]

  if (isLoading) {
    return (
      <div className="vacation-container">
        <div className="loading">Lade Urlaubsanträge...</div>
      </div>
    )
  }

  return (
    <div className="vacation-container">
      <header className="vacation-header">
        <button onClick={() => navigate('/time-tracking')} className="back-btn">
          ← Zurück
        </button>
        <h1>Urlaubsanträge</h1>
      </header>

      {/* Urlaubskonto */}
      <div className="vacation-account card">
        <h3>Ihr Urlaubskonto {vacationAccount.year || new Date().getFullYear()}</h3>
        <div className="vacation-stats">
          <div className="stat">
            <span className="stat-value">{remaining}</span>
            <span className="stat-label">Verfügbar</span>
          </div>
          <div className="stat">
            <span className="stat-value">{vacationAccount.used || 0}</span>
            <span className="stat-label">Genutzt</span>
          </div>
          <div className="stat">
            <span className="stat-value">{vacationAccount.total || 30}</span>
            <span className="stat-label">Gesamt</span>
          </div>
        </div>
        <div className="vacation-progress">
          <div 
            className="vacation-progress-bar" 
            style={{ width: `${((vacationAccount.used || 0) / (vacationAccount.total || 30)) * 100}%` }}
          />
        </div>
      </div>

      {/* Neuen Antrag Button */}
      {!showForm && (
        <button onClick={() => setShowForm(true)} className="btn primary-btn new-request-btn">
          ➕ Neuen Antrag stellen
        </button>
      )}

      {/* Antragsformular */}
      {showForm && (
        <div className="vacation-form card">
          <div className="form-header">
            <h3>Neuer Urlaubsantrag</h3>
            <button onClick={() => setShowForm(false)} className="close-btn">×</button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Von:</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  min={today}
                  required
                />
              </div>
              <div className="form-group">
                <label>Bis:</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  min={formData.startDate || today}
                  required
                />
              </div>
            </div>

            {workingDays > 0 && (
              <div className={`working-days-info ${workingDays > remaining ? 'warning' : 'info'}`}>
                {workingDays > remaining ? (
                  <>⚠️ {workingDays} Arbeitstage beantragt, aber nur {remaining} verfügbar</>
                ) : (
                  <>ℹ️ {workingDays} Arbeitstage</>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Art des Urlaubs:</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as LeaveRequest['type'] })}
              >
                <option value="vacation">Urlaub</option>
                <option value="special">Sonderurlaub</option>
                <option value="unpaid">Unbezahlter Urlaub</option>
              </select>
            </div>

            <div className="form-group">
              <label>Grund / Bemerkung (optional):</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="z.B. Familienfeier, Umzug..."
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="button" onClick={() => setShowForm(false)} className="btn secondary-btn">
                Abbrechen
              </button>
              <button type="submit" className="btn primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Wird eingereicht...' : 'Antrag einreichen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste der Anträge */}
      <div className="requests-list">
        <h3>Meine Anträge</h3>
        
        {leaveRequests.length === 0 ? (
          <p className="no-data">Noch keine Urlaubsanträge vorhanden</p>
        ) : (
          leaveRequests.map((request) => (
            <div key={request.id} className={`request-card card status-${request.status}`}>
              <div className="request-header">
                <span className="request-type">{getTypeLabel(request.type)}</span>
                {getStatusBadge(request.status)}
              </div>
              
              <div className="request-dates">
                <span className="date-range">
                  {formatDate(request.startDate)} - {formatDate(request.endDate)}
                </span>
                <span className="days-count">{request.workingDays} Arbeitstage</span>
              </div>
              
              {request.reason && (
                <p className="request-reason">{request.reason}</p>
              )}
              
              {request.status === 'rejected' && request.rejectionReason && (
                <p className="rejection-reason">
                  <strong>Ablehnungsgrund:</strong> {request.rejectionReason}
                </p>
              )}
              
              <div className="request-footer">
                <span className="request-date">
                  Eingereicht am {formatDate(request.createdAt)}
                </span>
                {request.status === 'pending' && (
                  <button 
                    onClick={() => handleDelete(request.id!)} 
                    className="delete-btn"
                    title="Antrag löschen"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default VacationRequests
