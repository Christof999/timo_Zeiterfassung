import { useNavigate } from 'react-router-dom'
import { minutesToHoursLabel } from '../utils/hoursInput'
import { monthKeyLabel } from '../utils/overtimeMonth'
import '../styles/Modal.css'
import '../styles/OvertimeReminderModal.css'

interface OvertimeReminderModalProps {
  /** Laufender Monat als "YYYY-MM" */
  month: string
  /** Verfügbare Überstunden in Minuten */
  balanceMinutes: number
  /** Hinweis für diesen Monat wegklicken */
  onDismiss: () => void
}

/**
 * Erinnerung am letzten Arbeitstag des Monats: Überstunden für den laufenden
 * Monat eintragen. Führt direkt auf die Verrechnungsseite.
 */
const OvertimeReminderModal: React.FC<OvertimeReminderModalProps> = ({
  month,
  balanceMinutes,
  onDismiss
}) => {
  const navigate = useNavigate()

  return (
    <div className="modal-overlay overtime-reminder-overlay" onClick={onDismiss}>
      <div className="modal-content overtime-reminder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Überstunden für {monthKeyLabel(month)}</h3>
          <button
            type="button"
            className="close-modal-btn"
            onClick={onDismiss}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            Der Monat ist gleich vorbei. Bitte tragen Sie noch ein, wie viele Ihrer Überstunden
            mit {monthKeyLabel(month)} verrechnet werden sollen.
          </p>
          <p className="overtime-reminder-balance">
            Auf Ihrem Konto: <strong>{minutesToHoursLabel(balanceMinutes)} Std</strong>
          </p>
          <div className="overtime-reminder-actions">
            <button
              type="button"
              className="btn primary-btn"
              onClick={() => navigate('/overtime')}
            >
              Jetzt eintragen
            </button>
            <button type="button" className="btn secondary-btn" onClick={onDismiss}>
              Diesen Monat nicht mehr erinnern
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OvertimeReminderModal
