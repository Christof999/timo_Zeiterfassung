import React, { useState, useRef } from 'react'
import '../styles/PhotoUpload.css'

interface PhotoUploadProps {
  label: string
  onPhotosChange: (files: File[]) => void
  maxPhotos?: number
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({ 
  label, 
  onPhotosChange, 
  maxPhotos = 10 
}) => {
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
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

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    const availableSlots = Math.max(0, maxPhotos - photos.length)
    const filesToAdd = imageFiles.slice(0, availableSlots)

    if (filesToAdd.length === 0) {
      return
    }

    try {
      const previewUrls = await Promise.all(filesToAdd.map((file) => readAsDataUrl(file)))
      setPreviews((prev) => [...prev, ...previewUrls])
      setPhotos((prev) => {
        const updatedPhotos = [...prev, ...filesToAdd]
        onPhotosChange(updatedPhotos)
        return updatedPhotos
      })
    } catch (error) {
      console.error('Fehler beim Lesen der Bilder:', error)
    }
  }

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index)
    const newPreviews = previews.filter((_, i) => i !== index)
    setPhotos(newPhotos)
    setPreviews(newPreviews)
    onPhotosChange(newPhotos)
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

        {previews.length > 0 && (
          <div className="image-preview">
            {previews.map((preview, index) => (
              <div key={index} className="preview-item">
                <img src={preview} alt={`Preview ${index + 1}`} />
                <span 
                  className="remove-preview" 
                  onClick={() => removePhoto(index)}
                >
                  ×
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default PhotoUpload

