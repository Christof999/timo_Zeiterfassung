import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { LeaveRequest } from '../../../types'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'

const VacationTab: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [allRequests, allEmployees] = await Promise.all([
        DataService.getAllLeaveRequests(),
        DataService.getAllEmployees()
      ])
      
      // Mitarbeiternamen hinzufügen falls nicht vorhanden
      const requestsWithNames = allRequests.map(req => {
        if (!req.employeeName) {
          const emp = allEmployees.find(e => e.id === req.employeeId)
          return { ...req, employeeName: emp?.name || `${emp?.firstName} ${emp?.lastName}` || 'Unbekannt' }
        }
        return req
      })
      
      // Sortieren: Ausstehende zuerst, dann nach Datum
      requestsWithNames.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (a.status !== 'pending' && b.status === 'pending') return 1
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt)
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt)
        return dateB.getTime() - dateA.getTime()
      })
      
      setRequests(requestsWithNames)
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Urlaubsanträge')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (request: LeaveRequest) => {
    try {
      await DataService.approveLeaveRequest(request.id!, 'Admin')
      toast.success('Antrag genehmigt')
      loadData()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    }
  }

  const handleRejectClick = (request: LeaveRequest) => {
    setSelectedRequest(request)
    setRejectionReason('')
    setRejectModalOpen(true)
  }

  const handleRejectConfirm = async () => {
    if (!selectedRequest) return
    
    try {
      await DataService.rejectLeaveRequest(selectedRequest.id!, rejectionReason)
      toast.success('Antrag abgelehnt')
      setRejectModalOpen(false)
      setSelectedRequest(null)
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
        return <span className="status-badge pending">Ausstehend</span>
      case 'approved':
        return <span className="status-badge approved">Genehmigt</span>
      case 'rejected':
        return <span className="status-badge rejected">Abgelehnt</span>
      default:
        return <span className="status-badge">{status}</span>
    }
  }

  const formatDate = (date: any) => {
    if (!date) return '-'
    const d = date?.toDate?.() || new Date(date)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const filteredRequests = requests.filter(req => {
    if (filter === 'all') return true
    return req.status === filter
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length

  if (isLoading) {
    return <div className="loading">Lade Urlaubsanträge...</div>
  }

  return (
    <div className="vacation-tab">
      <div className="tab-header">
        <h3>
          Urlaubsanträge
          {pendingCount > 0 && (
            <span className="pending-badge">{pendingCount} offen</span>
          )}
        </h3>
      </div>

      {/* Filter */}
      <div className="filter-tabs">
        <button 
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Ausstehend ({requests.filter(r => r.status === 'pending').length})
        </button>
        <button 
          className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          Genehmigt
        </button>
        <button 
          className={`filter-btn ${filter === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilter('rejected')}
        >
          Abgelehnt
        </button>
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Alle
        </button>
      </div>

      {/* Liste */}
      {filteredRequests.length === 0 ? (
        <p className="no-data">Keine Urlaubsanträge in dieser Kategorie</p>
      ) : (
        <div className="leave-requests-list">
          {filteredRequests.map((request) => (
            <div key={request.id} className={`leave-request-card status-${request.status}`}>
              <div className="request-main">
                <div className="request-info">
                  <div className="request-employee">{request.employeeName}</div>
                  <div className="request-type-badge">{getTypeLabel(request.type)}</div>
                </div>
                
                <div className="request-period">
                  <span className="period-dates">
                    {formatDate(request.startDate)} - {formatDate(request.endDate)}
                  </span>
                  <span className="period-days">{request.workingDays} Tage</span>
                </div>
                
                {request.reason && (
                  <div className="request-reason">{request.reason}</div>
                )}
                
                {request.status === 'rejected' && request.rejectionReason && (
                  <div className="request-rejection">
                    <strong>Ablehnungsgrund:</strong> {request.rejectionReason}
                  </div>
                )}
              </div>
              
              <div className="request-actions">
                {getStatusBadge(request.status)}
                
                {request.status === 'pending' && (
                  <div className="action-buttons">
                    <button 
                      onClick={() => handleApprove(request)}
                      className="btn approve-btn"
                      title="Genehmigen"
                    >
                      ✅ Genehmigen
                    </button>
                    <button 
                      onClick={() => handleRejectClick(request)}
                      className="btn reject-btn"
                      title="Ablehnen"
                    >
                      ❌ Ablehnen
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ablehnen-Modal */}
      {rejectModalOpen && selectedRequest && (
        <div className="modal-overlay" onClick={() => setRejectModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Antrag ablehnen</h3>
              <button className="modal-close" onClick={() => setRejectModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                Antrag von <strong>{selectedRequest.employeeName}</strong> für{' '}
                {formatDate(selectedRequest.startDate)} - {formatDate(selectedRequest.endDate)} ablehnen?
              </p>
              <div className="form-group">
                <label>Ablehnungsgrund (optional):</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="z.B. Betriebliche Gründe, zu viele Abwesenheiten..."
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setRejectModalOpen(false)} className="btn secondary-btn">
                Abbrechen
              </button>
              <button onClick={handleRejectConfirm} className="btn danger-btn">
                Antrag ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VacationTab
