import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { TimeEntry, Project } from '../../types'
import { toast } from '../ToastContainer'
import '../../styles/Modal.css'

interface TimeEntryEditModalProps {
  entry: TimeEntry
  projects: Project[]
  onClose: () => void
  onSave: () => void
}

const TimeEntryEditModal: React.FC<TimeEntryEditModalProps> = ({
  entry,
  projects,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState({
    projectId: entry.projectId || '',
    clockInDate: '',
    clockInTime: '',
    clockOutDate: '',
    clockOutTime: '',
    pauseMinutes: 0,
    notes: entry.notes || ''
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Initialdaten aus Entry setzen
    const clockIn = convertToDate(entry.clockInTime)
    const clockOut = convertToDate(entry.clockOutTime)

    setFormData({
      projectId: entry.projectId || '',
      clockInDate: clockIn ? formatDateForInput(clockIn) : '',
      clockInTime: clockIn ? formatTimeForInput(clockIn) : '',
      clockOutDate: clockOut ? formatDateForInput(clockOut) : '',
      clockOutTime: clockOut ? formatTimeForInput(clockOut) : '',
      pauseMinutes: entry.pauseTotalTime || 0,
      notes: entry.notes || ''
    })
  }, [entry])

  const convertToDate = (date: any): Date | null => {
    if (!date) return null
    if (date?.toDate) return date.toDate()
    if (date?.seconds) return new Date(date.seconds * 1000)
    if (date instanceof Date) return date
    const d = new Date(date)
    return isNaN(d.getTime()) ? null : d
  }

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const formatTimeForInput = (date: Date): string => {
    return date.toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.clockInDate || !formData.clockInTime) {
      toast.error('Bitte geben Sie Datum und Uhrzeit für Einstempeln an')
      return
    }

    setIsLoading(true)

    try {
      // Datum und Zeit kombinieren
      const clockInDateTime = new Date(`${formData.clockInDate}T${formData.clockInTime}:00`)
      
      let clockOutDateTime: Date | null = null
      if (formData.clockOutDate && formData.clockOutTime) {
        clockOutDateTime = new Date(`${formData.clockOutDate}T${formData.clockOutTime}:00`)
        
        // Validierung: Ausstempeln muss nach Einstempeln sein
        if (clockOutDateTime <= clockInDateTime) {
          toast.error('Ausstempelzeit muss nach Einstempelzeit liegen')
          setIsLoading(false)
          return
        }
      }

      const updateData: Partial<TimeEntry> = {
        projectId: formData.projectId,
        clockInTime: clockInDateTime,
        clockOutTime: clockOutDateTime,
        pauseTotalTime: formData.pauseMinutes,
        notes: formData.notes
      }

      await DataService.updateTimeEntry(entry.id, updateData)
      toast.success('Zeiteintrag erfolgreich korrigiert')
      onSave()
    } catch (error: any) {
      console.error('Fehler beim Speichern:', error)
      toast.error('Fehler beim Speichern: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteEntry = async () => {
    if (!confirm('Möchten Sie diesen Zeiteintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return
    }

    setIsLoading(true)
    try {
      await DataService.deleteTimeEntry(entry.id)
      toast.success('Zeiteintrag gelöscht')
      onSave()
    } catch (error: any) {
      toast.error('Fehler beim Löschen: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Arbeitszeit berechnen für Vorschau
  const calculatePreviewDuration = (): string => {
    if (!formData.clockInDate || !formData.clockInTime) return '-'
    if (!formData.clockOutDate || !formData.clockOutTime) return 'Offen'

    const clockIn = new Date(`${formData.clockInDate}T${formData.clockInTime}:00`)
    const clockOut = new Date(`${formData.clockOutDate}T${formData.clockOutTime}:00`)
    
    if (clockOut <= clockIn) return 'Ungültig'

    let diffMs = clockOut.getTime() - clockIn.getTime()
    diffMs -= formData.pauseMinutes * 60 * 1000

    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    return `${hours}h ${minutes}min`
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content time-entry-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Zeiteintrag korrigieren</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Projekt */}
          <div className="form-group">
            <label>Projekt:</label>
            <select
              value={formData.projectId}
              onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
              required
            >
              <option value="">-- Bitte wählen --</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name || project.id}
                </option>
              ))}
            </select>
          </div>

          {/* Einstempeln */}
          <div className="form-section">
            <h4>Einstempeln</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Datum:</label>
                <input
                  type="date"
                  value={formData.clockInDate}
                  onChange={(e) => setFormData({ ...formData, clockInDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Uhrzeit:</label>
                <input
                  type="time"
                  value={formData.clockInTime}
                  onChange={(e) => setFormData({ ...formData, clockInTime: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Ausstempeln */}
          <div className="form-section">
            <h4>Ausstempeln</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Datum:</label>
                <input
                  type="date"
                  value={formData.clockOutDate}
                  onChange={(e) => setFormData({ ...formData, clockOutDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Uhrzeit:</label>
                <input
                  type="time"
                  value={formData.clockOutTime}
                  onChange={(e) => setFormData({ ...formData, clockOutTime: e.target.value })}
                />
              </div>
            </div>
            <small className="form-hint">Leer lassen, wenn der Mitarbeiter noch eingestempelt ist</small>
          </div>

          {/* Pause */}
          <div className="form-group">
            <label>Pausenzeit (Minuten):</label>
            <input
              type="number"
              min="0"
              max="480"
              value={formData.pauseMinutes}
              onChange={(e) => setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 })}
            />
          </div>

          {/* Notizen */}
          <div className="form-group">
            <label>Notizen:</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Optionale Notizen..."
            />
          </div>

          {/* Vorschau */}
          <div className="duration-preview">
            <span className="preview-label">Berechnete Arbeitszeit:</span>
            <span className="preview-value">{calculatePreviewDuration()}</span>
          </div>

          {/* Aktionen */}
          <div className="modal-actions">
            <button 
              type="button" 
              onClick={handleDeleteEntry}
              className="btn danger-btn"
              disabled={isLoading}
            >
              🗑️ Löschen
            </button>
            <div className="action-spacer" />
            <button 
              type="button" 
              onClick={onClose} 
              className="btn secondary-btn"
              disabled={isLoading}
            >
              Abbrechen
            </button>
            <button 
              type="submit" 
              className="btn primary-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Speichere...' : '💾 Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TimeEntryEditModal

