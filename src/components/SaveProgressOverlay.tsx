import React from 'react'
import '../styles/SaveProgress.css'

interface SaveProgressOverlayProps {
  visible: boolean
  title?: string
  message: string
  current?: number
  total?: number
}

const SaveProgressOverlay: React.FC<SaveProgressOverlayProps> = ({
  visible,
  title = 'Wird gespeichert',
  message,
  current = 0,
  total = 0
}) => {
  if (!visible) return null

  const hasNumericProgress = total > 0 && current > 0
  const percent = hasNumericProgress
    ? Math.min(100, Math.round((current / total) * 100))
    : null

  return (
    <div className="save-progress-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="save-progress-card">
        <div className="save-progress-spinner" aria-hidden="true" />
        <p className="save-progress-title">{title}</p>
        <p className="save-progress-message">{message}</p>
        {hasNumericProgress && (
          <>
            <div className="save-progress-bar-track">
              <div
                className="save-progress-bar-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="save-progress-step">
              Schritt {current} von {total}
              {percent !== null ? ` (${percent} %)` : ''}
            </p>
          </>
        )}
        <p className="save-progress-hint">
          Große Fotos können auf dem Handy etwas dauern — bitte App geöffnet lassen.
        </p>
      </div>
    </div>
  )
}

export default SaveProgressOverlay
