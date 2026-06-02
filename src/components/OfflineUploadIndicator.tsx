import React, { useEffect, useRef, useState } from 'react'
import { offlineUploadQueue, type OfflineQueueState } from '../services/offlineUploadQueue'
import { toast } from './ToastContainer'
import '../styles/OfflineUploadIndicator.css'

/**
 * Kleiner, global sichtbarer Hinweis, solange Fotos auf den Upload warten (schlechtes Netz).
 * Zeigt die Anzahl ausstehender Fotos und meldet, sobald alles hochgeladen wurde.
 */
const OfflineUploadIndicator: React.FC = () => {
  const [state, setState] = useState<OfflineQueueState>(offlineUploadQueue.getState())
  const hadPendingRef = useRef(false)

  useEffect(() => {
    const unsubscribe = offlineUploadQueue.subscribe((next) => {
      // Erfolgsmeldung beim Übergang „es gab etwas“ → „alles hochgeladen“
      if (hadPendingRef.current && next.pendingPhotos === 0 && !next.processing) {
        toast.success('Alle zwischengespeicherten Fotos wurden hochgeladen.')
      }
      if (next.pendingPhotos > 0) hadPendingRef.current = true
      if (next.pendingPhotos === 0 && !next.processing) hadPendingRef.current = false
      setState(next)
    })
    return unsubscribe
  }, [])

  if (state.pendingPhotos <= 0) return null

  const count = state.pendingPhotos
  const label = state.processing
    ? `Lade ${count} Foto${count === 1 ? '' : 's'} hoch…`
    : `${count} Foto${count === 1 ? '' : 's'} warten auf Upload`

  return (
    <div
      className={`offline-upload-indicator${state.processing ? ' is-uploading' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="offline-upload-indicator__dot" aria-hidden="true" />
      <span className="offline-upload-indicator__text">{label}</span>
    </div>
  )
}

export default OfflineUploadIndicator
