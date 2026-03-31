import React, { useState, useRef } from 'react'
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
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({
  label,
  onItemsChange,
  maxPhotos = 10,
  commentFieldLabel = 'Kommentar zu diesem Bild (optional)'
}) => {
  const [slots, setSlots] = useState<PhotoUploadSlot[]>([])
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const readAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve((event.target?.result as string) || '')
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const emitItems = (nextSlots: PhotoUploadSlot[]) => {
    onItemsChange(nextSlots.map(({ file, comment }) => ({ file, comment })))
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    const availableSlots = Math.max(0, maxPhotos - slots.length)
    const filesToAdd = imageFiles.slice(0, availableSlots)

    if (filesToAdd.length === 0) {
      return
    }

    try {
      const newSlots: PhotoUploadSlot[] = await Promise.all(
        filesToAdd.map(async (file) => ({
          id: newSlotId(),
          file,
          comment: '',
          preview: await readAsDataUrl(file)
        }))
      )
      setSlots((prev) => {
        const next = [...prev, ...newSlots]
        emitItems(next)
        return next
      })
    } catch (error) {
      console.error('Fehler beim Lesen der Bilder:', error)
    }
  }

  const removeSlot = (id: string) => {
    setSlots((prev) => {
      const next = prev.filter((s) => s.id !== id)
      emitItems(next)
      return next
    })
  }

  const updateComment = (id: string, comment: string) => {
    setSlots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, comment } : s))
      emitItems(next)
      return next
    })
  }

  return (
    <div className="photo-upload">
      <label>{label}</label>
      <div className="file-upload-container">
        <input
          ref={cameraInputRef}
          type="file"
          id={`camera-${label}`}
          accept="image/*"
          capture="environment"
          className="file-input"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <label htmlFor={`camera-${label}`} className="file-label">
          Kamera öffnen
        </label>

        <input
          ref={galleryInputRef}
          type="file"
          id={`gallery-${label}`}
          accept="image/*"
          multiple
          className="file-input"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <label htmlFor={`gallery-${label}`} className="file-label">
          Galerie öffnen
        </label>

        {slots.length > 0 && (
          <div className="photo-upload-slots">
            {slots.map((slot) => (
              <div key={slot.id} className="photo-upload-slot">
                <div className="photo-upload-slot-thumb-wrap">
                  <div className="photo-upload-slot-thumb">
                    <img src={slot.preview} alt={slot.file.name} />
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
