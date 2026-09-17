import React, { useState } from 'react'
import { minutesToHoursLabel } from '../utils/hoursInput'
import type { OvertimeDayFillPlan } from '../services/dataService'
import '../styles/Modal.css'
import '../styles/OvertimeDayFillModal.css'

interface OvertimeDayFillModalProps {
  /** Frisch gerechneter Auffüll-Plan des heutigen Tages (inkl. Kontostand). */
  plan: OvertimeDayFillPlan
  /** Bucht die Auffüllung; wirft bei Fehlern. */
  onConfirm: () => Promise<void>
  onClose: () => void
}

/**
 * Rückfrage vor dem Auffüllen eines Tages aus dem Überstundenkonto.
 *
 * Nennt beide Seiten der Buchung – was der Tag bekommt und was das Konto
 * verliert –, damit niemand versehentlich Überstunden verbraucht.
 */
const OvertimeDayFillModal: React.FC<OvertimeDayFillModalProps> = ({
  plan,
  onConfirm,
  onClose
}) => {
  const [isSaving, setIsSaving] = useState(false)
  const { balanceMinutes } = plan

  const handleConfirm = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await onConfirm()
    } finally {
      setIsSaving(false)
    }
  }

  const fillLabel = `${minutesToHoursLabel(plan.fillMinutes)} Std`

  return (
    <div
      className="modal-overlay overtime-fill-overlay"
      onClick={isSaving ? undefined : onClose}
    >
      <div
        className="modal-content overtime-fill-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="overtime-fill-title"
      >
        <div className="modal-header">
          <h3 id="overtime-fill-title">Tag mit Überstunden auffüllen</h3>
          <button
            type="button"
            className="close-modal-btn"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="overtime-fill-question">
            Sollen die Stunden für heute um <strong>{fillLabel}</strong> aufgefüllt werden?
          </p>

          <dl className="overtime-fill-facts">
            <div className="overtime-fill-fact">
              <dt>Heute erfasst</dt>
              <dd>{minutesToHoursLabel(plan.workedMinutes)} Std</dd>
            </div>
            <div className="overtime-fill-fact">
              <dt>Regelarbeitszeit heute</dt>
              <dd>{minutesToHoursLabel(plan.regularMinutes)} Std</dd>
            </div>
            <div className="overtime-fill-fact">
              <dt>Überstundenkonto danach</dt>
              <dd>{minutesToHoursLabel(Math.max(0, balanceMinutes - plan.fillMinutes))} Std</dd>
            </div>
          </dl>

          {plan.isPartial && (
            <p className="overtime-fill-hint">
              Auf dem Konto liegen nur {minutesToHoursLabel(balanceMinutes)} Std – es fehlen
              {' '}
              {minutesToHoursLabel(plan.missingMinutes)} Std. Der Tag wird deshalb nur um{' '}
              {fillLabel} aufgefüllt.
            </p>
          )}

          <p className="overtime-fill-note">
            Die {fillLabel} werden von Ihrem Überstundenkonto abgezogen und für heute als
            Arbeitszeit gutgeschrieben.
          </p>

          <div className="overtime-fill-actions">
            <button
              type="button"
              className="btn primary-btn"
              onClick={handleConfirm}
              disabled={isSaving}
            >
              {isSaving ? 'Wird gebucht …' : `Ja, ${fillLabel} auffüllen`}
            </button>
            <button
              type="button"
              className="btn secondary-btn"
              onClick={onClose}
              disabled={isSaving}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OvertimeDayFillModal
