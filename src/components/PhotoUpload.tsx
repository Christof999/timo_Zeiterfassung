import React, { useEffect, useId, useState, useRef } from 'react'
import '../styles/PhotoUpload.css'

export interface PhotoUploadItem {
  file: File
  comment: string
}

type PhotoUploadSlot = {
  id: string
  file: File
  comment: string
  preview: string
}

function newSlotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface PhotoUploadProps {
  label: string
  onItemsChange: (items: PhotoUploadItem[]) => void
  maxPhotos?: number
  commentFieldLabel?: string
  /** document = höhere Qualität, Scan-Hinweise (Lieferscheine/Rechnungen) */
  captureMode?: 'photo' | 'document'
  /** Für den Fototest: Auswahl und Browser-Bilddekodierung getrennt prüfen. */
  showPreviews?: boolean
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({
  label,
  onItemsChange,
  maxPhotos = 10,
  commentFieldLabel = 'Kommentar zu diesem Bild (optional)',
  captureMode = 'photo',
  showPreviews = true
}) => {
  const isDocumentMode = captureMode === 'document'
  const inputId = useId()
  const [slots, setSlots] = useState<PhotoUploadSlot[]>([])
  const [selectionError, setSelectionError] = useState('')
  const slotsRef = useRef<PhotoUploadSlot[]>([])
  const previewUrls = useRef(new Set<string>())
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const emitItems = (nextSlots: PhotoUploadSlot[]) => {
    slotsRef.current = nextSlots
    setSlots(nextSlots)
    // Den Elternzustand im Event aktualisieren, niemals innerhalb eines State-Updaters.
    onItemsChange(nextSlots.map(({ file, comment }) => ({ file, comment })))
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    setSelectionError('')
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/') ||
      (!file.type && /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name))
    )
    const availableSlots = Math.max(0, maxPhotos - slotsRef.current.length)
    const filesToAdd = imageFiles.slice(0, availableSlots)

    if (filesToAdd.length === 0) {
      if (files.length > 0) {
        setSelectionError(availableSlots === 0
          ? `Es sind maximal ${maxPhotos} Bilder möglich.`
          : 'Die ausgewählte Datei wurde nicht als Bild erkannt. Bitte ein JPG- oder PNG-Foto auswählen.')
      }
      return
    }

    const newSlots: PhotoUploadSlot[] = []
    try {
      for (const file of filesToAdd) {
        // Keine Base64-Kopie großer Kamerafotos im React-Zustand halten.
        const preview = URL.createObjectURL(file)
        previewUrls.current.add(preview)
        newSlots.push({
          id: newSlotId(),
          file,
          comment: '',
          preview
        })
      }
    } catch (error) {
      for (const slot of newSlots) {
        URL.revokeObjectURL(slot.preview)
        previewUrls.current.delete(slot.preview)
      }
      console.error('Fehler beim Lesen der Bilder:', error)
      setSelectionError('Das Bild konnte nicht geöffnet werden. Bitte erneut auswählen.')
      return
    }
    emitItems([...slotsRef.current, ...newSlots])
  }

  const removeSlot = (id: string) => {
    const slot = slotsRef.current.find((s) => s.id === id)
    if (slot) {
      URL.revokeObjectURL(slot.preview)
      previewUrls.current.delete(slot.preview)
    }
    emitItems(slotsRef.current.filter((s) => s.id !== id))
  }

  const updateComment = (id: string, comment: string) => {
    emitItems(slotsRef.current.map((s) => (s.id === id ? { ...s, comment } : s)))
  }

  return (
    <div className="photo-upload">
      <label>{label}</label>
      <div className="file-upload-container">
        <input
          ref={cameraInputRef}
          type="file"
          id={`camera-${inputId}`}
          accept="image/*"
          capture="environment"
          className="file-input"
          onChange={(e) => {
            handleFileSelect(e.currentTarget.files)
            e.currentTarget.value = ''
          }}
        />
        <label htmlFor={`camera-${inputId}`} className="file-label file-label-primary">
          {isDocumentMode ? 'Dokument scannen (Kamera)' : 'Kamera öffnen'}
        </label>

        <input
          ref={galleryInputRef}
          type="file"
          id={`gallery-${inputId}`}
          accept="image/*"
          multiple
          className="file-input"
          onChange={(e) => {
            handleFileSelect(e.currentTarget.files)
            e.currentTarget.value = ''
          }}
        />
        <label htmlFor={`gallery-${inputId}`} className="file-label">
          {isDocumentMode ? 'Aus Dateien wählen' : 'Galerie öffnen'}
        </label>

        {selectionError && <p role="alert">{selectionError}</p>}

        {isDocumentMode && (
          <p className="photo-upload-scan-hint">
            Für Lieferscheine und Rechnungen: Dokument flach ablegen, gute Beleuchtung, Kamera
            möglichst gerade darüber halten — ähnlich wie beim iPhone-Scanner.
          </p>
        )}

        {slots.length > 0 && (
          <div className="photo-upload-slots">
            {slots.map((slot) => (
              <div key={slot.id} className="photo-upload-slot">
                <div className="photo-upload-slot-thumb-wrap">
                  <div className="photo-upload-slot-thumb">
                    {showPreviews ? <img
                      src={slot.preview}
                      alt={slot.file.name}
                      decoding="async"
                      onError={() => setSelectionError('Die Bildvorschau konnte nicht geöffnet werden. Bitte ein JPG- oder PNG-Foto verwenden.')}
                    /> : <span className="photo-upload-preview-placeholder">Foto ausgewählt</span>}
                    <button
                      type="button"
                      className="remove-preview"
                      onClick={() => removeSlot(slot.id)}
                      aria-label="Bild entfernen"
                    >
                      ×
                    </button>
                  </div>
                  <p className="photo-upload-filename">{slot.file.name}</p>
                </div>
                <div className="photo-upload-slot-comment">
                  <label htmlFor={`comment-${slot.id}`}>{commentFieldLabel}</label>
                  <textarea
                    id={`comment-${slot.id}`}
                    className="photo-upload-comment-input"
                    rows={2}
                    value={slot.comment}
                    onChange={(e) => updateComment(slot.id, e.target.value)}
                    placeholder="z. B. Bereich, Mangel, Fortschritt …"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default PhotoUpload
