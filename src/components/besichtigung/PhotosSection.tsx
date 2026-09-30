import { useState } from 'react'
import type { InspectionPhoto, InspectionVisualization } from '../../types/inspection'
import { visualizeTiles } from '../../services/inspectionAi'
import { deleteInspectionImage, uploadInspectionDataUrl, uploadInspectionImage } from '../../services/data/inspections'
import { blobToDataUrl, downscaleImage } from '../../utils/imageFile'
import { newId } from '../../utils/roomGeometry'
import { toast } from '../ToastContainer'

/** Flächen wie im Fliesenplaner – die Anweisung sagt der KI, was sie anfassen darf. */
const SURFACES = [
  {
    id: 'boden',
    label: 'Boden',
    instruction:
      'Belege ausschließlich den FUSSBODEN des Raumes mit den neuen Fliesen. Wände, Decke, Möbel und Sanitärobjekte bleiben unverändert.'
  },
  {
    id: 'wand',
    label: 'Wand',
    instruction:
      'Belege ausschließlich die WANDFLÄCHEN des Raumes mit den neuen Fliesen. Boden, Decke, Möbel und Sanitärobjekte bleiben unverändert.'
  },
  {
    id: 'dusche',
    label: 'Duschbereich',
    instruction:
      'Belege ausschließlich die WÄNDE im DUSCHBEREICH mit den neuen Fliesen. Boden, Armaturen und Glasabtrennung bleiben unverändert.'
  },
  {
    id: 'rueckwand',
    label: 'Küchenrückwand',
    instruction:
      'Belege ausschließlich den FLIESENSPIEGEL zwischen Arbeitsplatte und Oberschränken mit den neuen Fliesen. Alles andere bleibt unverändert.'
  }
]

interface SurfaceChoice {
  enabled: boolean
  /** verkleinertes Fliesenfoto als Data-URL */
  tile?: string
  hint: string
}

interface PhotosSectionProps {
  inspectionId: string
  uploader: string
  photos: InspectionPhoto[]
  visualizations: InspectionVisualization[]
  onChange: (patch: { photos?: InspectionPhoto[]; visualizations?: InspectionVisualization[] }) => void
}

const PhotosSection: React.FC<PhotosSectionProps> = ({ inspectionId, uploader, photos, visualizations, onChange }) => {
  const [isUploading, setIsUploading] = useState(false)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, SurfaceChoice>>({
    boden: { enabled: true, hint: '' },
    wand: { enabled: false, hint: '' },
    dusche: { enabled: false, hint: '' },
    rueckwand: { enabled: false, hint: '' }
  })
  const [note, setNote] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)

  const activePhoto = photos.find((p) => p.id === activePhotoId) || null

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      const added: InspectionPhoto[] = []
      for (const file of Array.from(files)) {
        const blob = await downscaleImage(file)
        const { url, storagePath } = await uploadInspectionImage(inspectionId, uploader, blob, 'foto.jpg')
        added.push({ id: newId('ph'), url, storagePath, createdAt: new Date().toISOString() })
      }
      onChange({ photos: [...photos, ...added] })
    } catch (error: any) {
      toast.error('Foto konnte nicht gespeichert werden: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsUploading(false)
    }
  }

  const removePhoto = async (photo: InspectionPhoto) => {
    if (!confirm('Foto löschen?')) return
    onChange({ photos: photos.filter((p) => p.id !== photo.id) })
    if (activePhotoId === photo.id) setActivePhotoId(null)
    await deleteInspectionImage(photo.storagePath)
  }

  const removeVisualization = async (vis: InspectionVisualization) => {
    if (!confirm('Visualisierung löschen?')) return
    onChange({ visualizations: visualizations.filter((v) => v.id !== vis.id) })
    await deleteInspectionImage(vis.storagePath)
  }

  const setTile = async (surfaceId: string, file?: File) => {
    if (!file) return
    const blob = await downscaleImage(file, 1024)
    const tile = await blobToDataUrl(blob)
    setChoices((c) => ({ ...c, [surfaceId]: { ...c[surfaceId], tile, enabled: true } }))
  }

  const enabledSurfaces = SURFACES.filter((s) => choices[s.id].enabled)

  const generate = async () => {
    if (!activePhoto || enabledSurfaces.length === 0) return
    setIsGenerating(true)
    setResult(null)
    try {
      const image = await visualizeTiles(
        activePhoto.url,
        enabledSurfaces.map((s) => ({
          label: s.label,
          instruction: [s.instruction, choices[s.id].hint].filter(Boolean).join(' '),
          tileImage: choices[s.id].tile
        })),
        note.trim() || undefined
      )
      setResult(image)
      setShowOriginal(false)
    } catch (error: any) {
      toast.error(error?.message || 'Bild konnte nicht erzeugt werden.')
    } finally {
      setIsGenerating(false)
    }
  }

  const saveResult = async () => {
    if (!result || !activePhoto) return
    setIsSaving(true)
    try {
      const saved = await uploadInspectionDataUrl(inspectionId, uploader, result, 'visualisierung.png')
      // Die erste Fliese mitspeichern – fürs Angebot und um später nachzusehen, welche es war.
      const firstTile = enabledSurfaces.map((s) => choices[s.id].tile).find(Boolean)
      const tile = firstTile ? await uploadInspectionDataUrl(inspectionId, uploader, firstTile, 'fliese.jpg') : null
      const vis: InspectionVisualization = {
        id: newId('vis'),
        url: saved.url,
        storagePath: saved.storagePath,
        sourcePhotoId: activePhoto.id,
        tileUrl: tile?.url,
        surfaces: enabledSurfaces.map((s) => s.label),
        prompt: note.trim() || undefined,
        createdAt: new Date().toISOString()
      }
      onChange({ visualizations: [...visualizations, vis] })
      setResult(null)
      toast.success('Visualisierung gespeichert')
    } catch (error: any) {
      toast.error('Speichern fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="photo-grid">
        {photos.map((photo) => (
          <div key={photo.id} className={`photo-tile ${activePhotoId === photo.id ? 'active' : ''}`}>
            <button type="button" className="photo-thumb" onClick={() => setActivePhotoId(activePhotoId === photo.id ? null : photo.id)}>
              <img src={photo.url} alt="Raumfoto" loading="lazy" />
            </button>
            <button type="button" className="photo-remove" onClick={() => removePhoto(photo)} aria-label="Foto löschen">
              ×
            </button>
          </div>
        ))}
        <label className={`photo-add ${isUploading ? 'busy' : ''}`}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              addPhotos(e.target.files)
              e.target.value = ''
            }}
            disabled={isUploading}
          />
          {isUploading ? '…' : '📷'}
          <span>{isUploading ? 'Lädt' : 'Foto'}</span>
        </label>
        <label className={`photo-add ${isUploading ? 'busy' : ''}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              addPhotos(e.target.files)
              e.target.value = ''
            }}
            disabled={isUploading}
          />
          🖼
          <span>Galerie</span>
        </label>
      </div>
      {photos.length > 0 && !activePhoto && <p className="hint">Foto antippen, um neue Fliesen darauf zu zeigen.</p>}

      {activePhoto && (
        <div className="visualizer">
          <h4>Neue Fliesen zeigen</h4>
          <div className="surface-list">
            {SURFACES.map((s) => {
              const choice = choices[s.id]
              return (
                <div key={s.id} className={`surface-card ${choice.enabled ? 'enabled' : ''}`}>
                  <label className="surface-toggle">
                    <input
                      type="checkbox"
                      checked={choice.enabled}
                      onChange={(e) => setChoices((c) => ({ ...c, [s.id]: { ...c[s.id], enabled: e.target.checked } }))}
                    />
                    {s.label}
                  </label>
                  {choice.enabled && (
                    <div className="surface-body">
                      <label className="tile-pick">
                        <input type="file" accept="image/*" onChange={(e) => setTile(s.id, e.target.files?.[0])} />
                        {choice.tile ? <img src={choice.tile} alt="Fliese" /> : <span>Fliese fotografieren</span>}
                      </label>
                      <input
                        value={choice.hint}
                        onChange={(e) => setChoices((c) => ({ ...c, [s.id]: { ...c[s.id], hint: e.target.value } }))}
                        placeholder="Hinweis, z. B. 60×120 hochkant, helle Fuge"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Weitere Wünsche (optional)" className="full-input" />
          <button
            type="button"
            className="btn primary-btn full-width"
            onClick={generate}
            disabled={isGenerating || enabledSurfaces.length === 0}
          >
            {isGenerating ? 'KI legt die Fliesen… (bis zu 30 s)' : '✨ Bild erzeugen'}
          </button>

          {result && (
            <div className="vis-result">
              <img
                src={showOriginal ? activePhoto.url : result}
                alt="Visualisierung"
                onPointerDown={() => setShowOriginal(true)}
                onPointerUp={() => setShowOriginal(false)}
                onPointerLeave={() => setShowOriginal(false)}
              />
              <p className="hint">Gedrückt halten zeigt das Original.</p>
              <div className="inline-row">
                <button type="button" className="btn secondary-btn" onClick={generate} disabled={isGenerating}>
                  Nochmal
                </button>
                <button type="button" className="btn primary-btn" onClick={saveResult} disabled={isSaving}>
                  {isSaving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {visualizations.length > 0 && (
        <>
          <h4 className="sub-heading">Visualisierungen</h4>
          <div className="photo-grid">
            {visualizations.map((vis) => (
              <div key={vis.id} className="photo-tile">
                <button type="button" className="photo-thumb" onClick={() => setViewer(vis.url)}>
                  <img src={vis.url} alt={vis.surfaces.join(', ')} loading="lazy" />
                  <span className="photo-caption">{vis.surfaces.join(' + ')}</span>
                </button>
                <button type="button" className="photo-remove" onClick={() => removeVisualization(vis)} aria-label="Visualisierung löschen">
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {viewer && (
        <div className="image-viewer" onClick={() => setViewer(null)} role="dialog" aria-label="Bild ansehen">
          <img src={viewer} alt="Visualisierung groß" />
        </div>
      )}
    </>
  )
}

export default PhotosSection
