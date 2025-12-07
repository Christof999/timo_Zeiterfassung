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

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newFiles: File[] = []
    const newPreviews: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith('image/')) {
        if (photos.length + newFiles.length >= maxPhotos) {
          // Toast wird von der aufrufenden Komponente angezeigt
          break
        }
        newFiles.push(file)
        
        const reader = new FileReader()
        reader.onload = (e) => {
          newPreviews.push(e.target?.result as string)
          if (newPreviews.length === newFiles.length) {
            setPreviews([...previews, ...newPreviews])
            setPhotos([...photos, ...newFiles])
            onPhotosChange([...photos, ...newFiles])
          }
        }
        reader.readAsDataURL(file)
      }
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
          📷 Kamera öffnen
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
          🖼️ Galerie öffnen
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

