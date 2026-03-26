import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { Project, FileUpload, TimeEntry } from '../../types'
import { Timestamp } from 'firebase/firestore'
import '../../styles/Modal.css'

interface ProjectDetailModalProps {
  project: Project
  onClose: () => void
}

interface TimeEntryWithEmployee extends TimeEntry {
  employeeName?: string
}

const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({ project, onClose }) => {
  const [activeTab, setActiveTab] = useState<'construction-site' | 'documents' | 'timeentries'>('construction-site')
  const [photos, setPhotos] = useState<FileUpload[]>([])
  const [documents, setDocuments] = useState<FileUpload[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntryWithEmployee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; fileName: string; notes?: string } | null>(null)

  useEffect(() => {
    loadProjectData()
  }, [project])

  const loadProjectData = async () => {
    setIsLoading(true)
    try {
      console.log('Lade Projektdaten für:', project.id, project.name)
      
      // Verwende getProjectFiles wie in der alten App (lädt aus Zeiteinträgen)
      const [allPhotos, allDocs, timeEntries, employees] = await Promise.all([
        DataService.getProjectFiles(project.id!, 'construction_site').catch(err => {
          console.error('Fehler beim Laden der Fotos:', err)
          return []
        }),
        DataService.getProjectFiles(project.id!, 'document').catch(err => {
          console.error('Fehler beim Laden der Dokumente:', err)
          return []
        }),
        DataService.getTimeEntriesByProject(project.id!).catch(err => {
          console.error('Fehler beim Laden der Zeiteinträge:', err)
          return []
        }),
        DataService.getAllEmployees().catch(err => {
          console.error('Fehler beim Laden der Mitarbeiter:', err)
          return []
        })
      ])
      
      console.log('Geladene Fotos:', allPhotos.length, allPhotos)
      console.log('Geladene Dokumente:', allDocs.length, allDocs)
      console.log('Geladene Zeiteinträge:', timeEntries.length)
      console.log('Geladene Mitarbeiter:', employees.length)
      
      // Debug: Zeige die ersten 2 Fotos komplett mit ALLEN Feldern
      if (allPhotos.length > 0) {
        console.log('🖼️ ERSTES FOTO KOMPLETT:', JSON.stringify(allPhotos[0], null, 2))
        console.log('🖼️ ALLE FELDER DES ERSTEN FOTOS:', Object.keys(allPhotos[0]))
        if (allPhotos.length > 1) {
          console.log('🖼️ ZWEITES FOTO KOMPLETT:', JSON.stringify(allPhotos[1], null, 2))
        }
      }
      
      // Mitarbeiternamen zu Zeiteinträgen hinzufügen
      const entriesWithNames: TimeEntryWithEmployee[] = timeEntries.map(entry => {
        const employee = employees.find(emp => emp.id === entry.employeeId)
        return {
          ...entry,
          employeeName: employee 
            ? (employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim())
            : entry.employeeId
        }
      })
      
      setPhotos(allPhotos)
      setDocuments(allDocs)
      setTimeEntries(entriesWithNames)
    } catch (error) {
      console.error('Fehler beim Laden der Projektdaten:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Hilfsfunktion zum Konvertieren von Timestamps zu Date
  const convertToDate = (timestamp: any): Date | null => {
    if (!timestamp) return null
    
    if (timestamp instanceof Date) {
      return timestamp
    }
    
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate()
    }
    
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate()
    }
    
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp)
    }
    
    // Firebase Timestamp Format { seconds, nanoseconds }
    if (timestamp.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000)
    }
    
    return null
  }

  // Hilfsfunktion zur Berechnung der Arbeitsstunden
  const calculateHours = (entry: TimeEntry): string => {
    if (!entry.clockOutTime || !entry.clockInTime) {
      return '-'
    }

    const clockIn = convertToDate(entry.clockInTime)
    const clockOut = convertToDate(entry.clockOutTime)

    if (!clockIn || !clockOut) {
      return '-'
    }

    const diffMs = clockOut.getTime() - clockIn.getTime()
    const pauseTotalTime = entry.pauseTotalTime || 0
    const actualWorkTime = diffMs - pauseTotalTime
    const hours = actualWorkTime / (1000 * 60 * 60)

    if (isNaN(hours) || hours < 0) {
      return '-'
    }

    return hours.toFixed(2) + 'h'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content project-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{project.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="project-detail-info">
          <p><strong>Kunde:</strong> {project.client || '-'}</p>
          <p><strong>Status:</strong> {project.status || 'Aktiv'}</p>
          {(project.address || project.location) && (
            <p><strong>Adresse:</strong> {project.address || project.location}</p>
          )}
          {project.description && (
            <div className="project-description">
              <strong>Beschreibung:</strong>
              <div className="description-text">
                {project.description.split('\n').map((line, index) => (
                  <p key={index}>{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="project-tabs">
          <button 
            className={`project-tab-btn ${activeTab === 'construction-site' ? 'active' : ''}`}
            onClick={() => setActiveTab('construction-site')}
          >
            Baustellenfotos
          </button>
          <button 
            className={`project-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Dokumente
          </button>
          <button 
            className={`project-tab-btn ${activeTab === 'timeentries' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeentries')}
          >
            Zeiteinträge
          </button>
        </div>

        <div className="project-tab-content">
          {isLoading ? (
            <div className="loading">Lade Daten...</div>
          ) : activeTab === 'construction-site' ? (
            <div className="photo-gallery">
            {photos.length === 0 ? (
                <p className="no-data">Keine Fotos vorhanden</p>
              ) : (
                photos.map((photo) => {
                // Prüfe verschiedene mögliche Formate für base64Data oder filePath/URL
                const base64Data = photo.base64Data || (photo as any).base64 || (photo as any).base64DataUrl || (photo as any).base64String || ''
                let mimeType = photo.mimeType || 'image/jpeg'
                
                // Falls mimeType ein data URL Präfix ist, extrahiere nur den MIME-Type
                if (mimeType.startsWith('data:')) {
                  const match = mimeType.match(/^data:([^;,]+)/)
                  if (match) {
                    mimeType = match[1]
                  }
                }
                
                const fileUrl = photo.filePath || (photo as any).url || ''

                const key = `${photo.id || photo.fileName || fileUrl}-${photo.employeeId || ''}-${Math.random()}`

                // Verwende entweder base64 oder die URL (Firebase Storage)
                let imgSrc = ''
                if (base64Data) {
                  imgSrc = `data:${mimeType};base64,${base64Data}`
                } else if (fileUrl) {
                  // fileUrl könnte bereits eine data URL oder eine Firebase Storage URL sein
                  imgSrc = fileUrl
                }

                return (
                  <div key={key} className="photo-item">
                    {imgSrc ? (
                      <img 
                        src={imgSrc} 
                        alt={photo.fileName}
                        onClick={() => setLightboxImage({ src: imgSrc, fileName: photo.fileName })}
                        style={{ cursor: 'pointer' }}
                        onError={(e) => {
                          console.error('Fehler beim Laden des Bildes:', photo.fileName, {
                            hasBase64: !!base64Data,
                            base64Length: base64Data ? base64Data.length : 0,
                            mimeType: mimeType,
                            photo: photo
                          })
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="photo-placeholder">
                        <span>📷</span>
                        <p>Keine Bilddaten vorhanden</p>
                        <p className="photo-filename">{photo.fileName}</p>
                      </div>
                    )}
                    <p className="photo-filename">{photo.fileName}</p>
                    {photo.imageComment && (
                      <p className="photo-comment">{photo.imageComment}</p>
                    )}
                  </div>
                )
                })
              )}
            </div>
          ) : activeTab === 'documents' ? (
            <div className="photo-gallery documents-gallery">
              {documents.length === 0 ? (
                <p className="no-data">Keine Dokumente vorhanden</p>
              ) : (
                documents.map((doc, index) => {
                  const base64Data = doc.base64Data || (doc as any).base64 || (doc as any).base64String || ''
                  let mimeType = doc.mimeType || 'image/jpeg'
                  
                  // Falls mimeType ein data URL Präfix ist, extrahiere nur den MIME-Type
                  if (mimeType.startsWith('data:')) {
                    const match = mimeType.match(/^data:([^;,]+)/)
                    if (match) {
                      mimeType = match[1]
                    }
                  }
                  
                  const fileUrl = doc.filePath || (doc as any).url || ''
                  const key = `doc-${doc.id || doc.fileName || index}-${index}-${Math.random()}`
                  
                  // Erstelle die Bild-URL
                  let imgSrc = ''
                  if (base64Data) {
                    imgSrc = `data:${mimeType};base64,${base64Data}`
                  } else if (fileUrl) {
                    imgSrc = fileUrl
                  }
                  
                  // Prüfe ob es ein Bild ist
                  const isImage = mimeType.startsWith('image/') || 
                    doc.fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
                    fileUrl?.startsWith('data:image/')
                  
                  return (
                    <div key={key} className="photo-item document-item-card">
                      {imgSrc && isImage ? (
                        <img 
                          src={imgSrc} 
                          alt={doc.fileName}
                          onClick={() => setLightboxImage({ src: imgSrc, fileName: doc.fileName, notes: doc.notes })}
                          style={{ cursor: 'pointer' }}
                          onError={(e) => {
                            console.error('Fehler beim Laden des Dokuments:', doc.fileName)
                            e.currentTarget.style.display = 'none'
                            const parent = e.currentTarget.parentElement
                            if (parent) {
                              const placeholder = document.createElement('div')
                              placeholder.className = 'photo-placeholder'
                              placeholder.innerHTML = '<span>📄</span>'
                              parent.insertBefore(placeholder, e.currentTarget)
                            }
                          }}
                        />
                      ) : (
                        <div className="photo-placeholder document-placeholder">
                          <span>📄</span>
                        </div>
                      )}
                      <p className="photo-filename">{doc.fileName}</p>
                      {doc.notes && <p className="document-notes">{doc.notes}</p>}
                      {imgSrc && (
                        <a 
                          href={imgSrc}
                          download={doc.fileName}
                          className="document-download-btn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ⬇ Download
                        </a>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className="time-entries-cards">
              {timeEntries.length === 0 ? (
                <p className="no-data">Keine Zeiteinträge vorhanden</p>
              ) : (
                timeEntries.map((entry) => {
                  const clockInDate = convertToDate(entry.clockInTime)
                  const clockOutDate = convertToDate(entry.clockOutTime)
                  
                  return (
                    <div key={entry.id} className="time-entry-card">
                      <div className="time-entry-header">
                        <span className="time-entry-employee">{entry.employeeName || entry.employeeId}</span>
                        <span className="time-entry-hours">{calculateHours(entry)}</span>
                      </div>
                      <div className="time-entry-details">
                        <span className="time-entry-date">
                          {clockInDate 
                            ? clockInDate.toLocaleDateString('de-DE', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: '2-digit' 
                              })
                            : '-'}
                        </span>
                        <span className="time-entry-times">
                          {clockInDate 
                            ? clockInDate.toLocaleTimeString('de-DE', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            : '-'}
                          {' - '}
                          {clockOutDate 
                            ? clockOutDate.toLocaleTimeString('de-DE', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            : 'Eingestempelt'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal für Bildvergrößerung */}
      {lightboxImage && (
        <div 
          className="lightbox-overlay" 
          onClick={() => setLightboxImage(null)}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="lightbox-close" 
              onClick={() => setLightboxImage(null)}
            >
              ×
            </button>
            <img 
              src={lightboxImage.src} 
              alt={lightboxImage.fileName}
            />
            <p className="lightbox-filename">{lightboxImage.fileName}</p>
            {lightboxImage.notes && (
              <div className="lightbox-notes">
                <strong>Beschreibung:</strong>
                <p>{lightboxImage.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectDetailModal

