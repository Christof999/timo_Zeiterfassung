import { formatOfferHours, offerHoursUsage } from '../../utils/offerHours'
import '../../styles/OfferHoursBar.css'

interface OfferHoursBarProps {
  quotedHours: number
  bookedHours: number
  /** Prozentzahl sitzt dann außerhalb, z. B. groß neben dem Projektnamen. */
  hidePercent?: boolean
}

/**
 * Angebotsstunden sind die volle Länge. Der Balken zeigt, wie viel davon
 * schon auf dem Projekt gebucht ist. Über 100 % bleibt der Balken voll und
 * die Zahl läuft weiter.
 */
const OfferHoursBar: React.FC<OfferHoursBarProps> = ({ quotedHours, bookedHours, hidePercent = false }) => {
  const usage = offerHoursUsage(quotedHours, bookedHours)
  const fill = Math.min(100, Math.max(0, usage.ratio * 100))
  const tone = usage.percent > 100 ? 'is-over' : usage.percent >= 85 ? 'is-warning' : ''
  const bookedLabel = formatOfferHours(usage.bookedHours)
  const quotedLabel = formatOfferHours(usage.quotedHours)
  const text = `${bookedLabel} / ${quotedLabel} Std`

  return (
    <div className={`offer-hours${tone ? ` ${tone}` : ''}`}>
      <div
        className="offer-hours-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.quotedHours}
        aria-valuenow={Math.round(usage.bookedHours * 100) / 100}
        aria-label={`${text}, ${usage.percent} Prozent der Angebotsstunden`}
        title="Gebuchte Stunden gegenüber den Arbeitsstunden aus dem Angebot"
      >
        <div className="offer-hours-fill" style={{ width: `${fill}%` }} />
      </div>
      <span className="offer-hours-label">
        <span>{text}</span>
        {!hidePercent && <span className="offer-hours-percent">{usage.percent}%</span>}
      </span>
    </div>
  )
}

export default OfferHoursBar
