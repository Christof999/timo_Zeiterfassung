import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { Employee, LeaveRequest } from '../../../types'
import type { RecordableVacationType } from '../../../services/data/leave'
import { toast } from '../../ToastContainer'
import { formatDateForInputLocal } from '../../../utils/dateUtils'
import '../../../styles/AdminTabs.css'

/** Was der Admin selbst hinterlegen kann. */
type AbsenceKind = 'sick' | 'school' | 'vacation'

const ABSENCE_TITLES: Record<AbsenceKind, string> = {
  sick: 'Krankheit melden',
  school: 'Berufsschule melden',
  vacation: 'Urlaub eintragen'
}

const VACATION_TYPE_OPTIONS: { value: RecordableVacationType; label: string }[] = [
  { value: 'vacation', label: 'Urlaub' },
  { value: 'special', label: 'Sonderurlaub' },
  { value: 'unpaid', label: 'Unbezahlter Urlaub' },
  { value: 'overtime', label: 'Urlaub auf Überstunden' }
]

const VacationTab: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  /** Welche Abwesenheit der Admin gerade meldet – alle laufen gleich ab. */
  const [absenceModal, setAbsenceModal] = useState<AbsenceKind | null>(null)
  const [isSavingAbsence, setIsSavingAbsence] = useState(false)
  const [absenceForm, setAbsenceForm] = useState({
    employeeId: '',
    startDate: formatDateForInputLocal(new Date()),
    endDate: formatDateForInputLocal(new Date()),
    reason: '',
    /** Nur für 'vacation': welche Urlaubsart hinterlegt wird. */
    vacationType: 'vacation' as RecordableVacationType
  })
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
      setEmployees(allEmployees)
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Urlaubsanträge')
    } finally {
      setIsLoading(false)
    }
  }

  const employeeLabel = (employee: Employee): string =>
    employee.name ||
    `${employee.firstName || ''} ${employee.lastName || ''}`.trim() ||
    employee.id ||
    'Mitarbeiter'

  /**
   * Krankheit, Berufsschule und Urlaub werden identisch gemeldet – nur der Typ
   * wechselt. Ein Mindestdatum gibt es bewusst nicht: der Admin muss auch
   * rückwirkend nachtragen können, was jemand vergessen hat zu beantragen.
   */
  const handleReportAbsence = async () => {
    if (!absenceModal) return
    if (!absenceForm.employeeId) {
      toast.error('Bitte einen Mitarbeiter auswählen')
      return
    }
    const start = new Date(`${absenceForm.startDate}T12:00:00`)
    const end = new Date(`${absenceForm.endDate}T12:00:00`)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      toast.error('Bitte gültige Daten angeben')
      return
    }
    if (end < start) {
      toast.error('Das Ende darf nicht vor dem Beginn liegen')
      return
    }

    setIsSavingAbsence(true)
    try {
      const employee = employees.find(e => e.id === absenceForm.employeeId)
      const daten = {
        employeeId: absenceForm.employeeId,
        employeeName: employee ? employeeLabel(employee) : '',
        startDate: start,
        endDate: end,
        reason: absenceForm.reason.trim(),
        reportedBy: 'Admin'
      }
      if (absenceModal === 'school') await DataService.reportSchoolDays(daten)
      else if (absenceModal === 'vacation') {
        await DataService.recordVacation({ ...daten, type: absenceForm.vacationType })
      } else await DataService.reportSickLeave(daten)
      toast.success(
        absenceModal === 'school'
          ? 'Berufsschultage gespeichert'
          : absenceModal === 'vacation'
            ? 'Urlaub eingetragen und genehmigt'
            : 'Krankmeldung gespeichert'
      )
      setAbsenceModal(null)
      setAbsenceForm(prev => ({ ...prev, reason: '' }))
      loadData()
    } catch (error: any) {
      toast.error(error?.message || 'Die Meldung konnte nicht gespeichert werden')
    } finally {
      setIsSavingAbsence(false)
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
      case 'overtime': return 'Urlaub auf Überstunden'
      case 'school': return 'Berufsschule'
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
        <div className="tab-header-actions">
          <button
            type="button"
            className="btn secondary-btn"
            onClick={() => setAbsenceModal('vacation')}
          >
            Urlaub eintragen
          </button>
          <button
            type="button"
            className="btn secondary-btn"
            onClick={() => setAbsenceModal('school')}
          >
            Berufsschule melden
          </button>
          <button
            type="button"
            className="btn primary-btn"
            onClick={() => setAbsenceModal('sick')}
          >
            Krankheit melden
          </button>
        </div>
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
                      Genehmigen
                    </button>
                    <button 
                      onClick={() => handleRejectClick(request)}
                      className="btn reject-btn"
                      title="Ablehnen"
                    >
                      Ablehnen
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

      {absenceModal && (
        <div className="modal-overlay" onClick={() => setAbsenceModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{ABSENCE_TITLES[absenceModal]}</h3>
              <button className="modal-close" onClick={() => setAbsenceModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Mitarbeiter:</label>
                <select
                  value={absenceForm.employeeId}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, employeeId: e.target.value })}
                >
                  <option value="">— bitte wählen —</option>
                  {employees.filter((employee) => !!employee.id).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeLabel(employee)}
                      {employee.isApprentice ? ' (Azubi)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {absenceModal === 'vacation' && (
                <div className="form-group">
                  <label>Art des Urlaubs:</label>
                  <select
                    value={absenceForm.vacationType}
                    onChange={(e) =>
                      setAbsenceForm({
                        ...absenceForm,
                        vacationType: e.target.value as RecordableVacationType
                      })
                    }
                  >
                    {VACATION_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Von:</label>
                <input
                  type="date"
                  value={absenceForm.startDate}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, startDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Bis:</label>
                <input
                  type="date"
                  value={absenceForm.endDate}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, endDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Notiz (optional):</label>
                <textarea
                  value={absenceForm.reason}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, reason: e.target.value })}
                  placeholder={
                    absenceModal === 'school'
                      ? 'z.B. Blockunterricht'
                      : absenceModal === 'vacation'
                        ? 'z.B. nachträglich eingetragen'
                        : 'z.B. Attest liegt vor'
                  }
                  rows={2}
                />
              </div>
              <p className="modal-hint">
                Gezählt werden nur Werktage ohne gesetzlichen Feiertag. Im Zeiterfassungsbericht
                werden sie mit der Regelarbeitszeit vergütet – Montag bis Donnerstag 8 Std,
                Freitag 6 Std.
                {absenceModal === 'school' && (
                  <>
                    {' '}Berufsschultage zählen nicht gegen den Urlaubsanspruch; auf dem Nachweis
                    steht damit der Grund, warum an dem Tag nicht gearbeitet wurde.
                  </>
                )}
                {absenceModal === 'vacation' && (
                  <>
                    {' '}Der Urlaub wird sofort als genehmigt gespeichert – auch rückwirkend, wenn
                    ein Zeitraum in der Vergangenheit gewählt wird. „Urlaub auf Überstunden“
                    belastet dabei das Überstundenkonto des Mitarbeiters.
                  </>
                )}
              </p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setAbsenceModal(null)} className="btn secondary-btn">
                Abbrechen
              </button>
              <button
                onClick={handleReportAbsence}
                className="btn primary-btn"
                disabled={isSavingAbsence}
              >
                {isSavingAbsence
                  ? 'Speichert…'
                  : absenceModal === 'vacation'
                    ? 'Urlaub speichern'
                    : 'Meldung speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VacationTab
