import { useState } from 'react'
import PhotoUpload, { type PhotoUploadItem } from './PhotoUpload'
import '../styles/PhotoUploadDiagnostic.css'

export default function PhotoUploadDiagnostic() {
  const [items, setItems] = useState<PhotoUploadItem[]>([])
  const [showPreviews, setShowPreviews] = useState(false)

  return (
    <main className="photo-diagnostic">
      <h1>Fototest</h1>
      <p className="photo-diagnostic-version">Testversion 09.10.2026 · 2</p>
      <p>
        Bitte zuerst ein Foto mit der Kamera oder aus der Galerie auswählen.
        Die Vorschau ist zunächst ausgeschaltet. Danach unten „Bildvorschau anzeigen“ antippen.
      </p>
      <p>Dieser Test lädt keine Fotos hoch. Beim Schließen werden die ausgewählten Fotos verworfen.</p>
      <PhotoUpload
        label="Foto auswählen"
        onItemsChange={setItems}
        showPreviews={showPreviews}
      />
      <p role="status" aria-live="polite">
        {items.length === 0
          ? 'Noch kein Foto ausgewählt.'
          : `${items.length} Foto(s) erfolgreich aus der Dateiauswahl übernommen.`}
      </p>
      {items.length > 0 && (
        <>
          <ul>
            {items.map((item, index) => (
              <li key={index}>
                {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)} MB
                {' · '}{item.file.type || 'Dateityp nicht angegeben'}
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary-btn" onClick={() => setShowPreviews(v => !v)}>
            {showPreviews ? 'Bildvorschau ausschalten' : 'Bildvorschau anzeigen'}
          </button>
        </>
      )}
      <p><a href="/time-tracking">Zur Zeiterfassung</a></p>
    </main>
  )
}
