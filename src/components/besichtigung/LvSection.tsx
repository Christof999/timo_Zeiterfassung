import { useRef, useState } from 'react'
import type { LvPosition } from '../../types/inspection'
import { generateLvFromDescription, transcribe } from '../../services/inspectionAi'
import { blobToDataUrl } from '../../utils/imageFile'
import { newId } from '../../utils/roomGeometry'
import { toast } from '../ToastContainer'

const UNITS = ['m²', 'm', 'Stk', 'psch', 'h']

interface LvSectionProps {
  description: string
  lvTitle?: string
  positions: LvPosition[]
  roomSummaries: string[]
  onChange: (patch: { description?: string; lvTitle?: string; lvPositions?: LvPosition[] }) => void
}

const LvSection: React.FC<LvSectionProps> = ({ description, lvTitle, positions, roomSummaries, onChange }) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setIsRecording(false)
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setIsTranscribing(true)
        try {
          const dataUrl = await blobToDataUrl(blob)
          const text = await transcribe(dataUrl.split(',')[1] || '', recorder.mimeType.split(';')[0] || 'audio/webm')
          if (text) onChange({ description: description.trim() ? `${description.trim()}\n${text}` : text })
        } catch (error: any) {
          toast.error('Diktat konnte nicht übertragen werden: ' + (error?.message || 'Unbekannter Fehler'))
        } finally {
          setIsTranscribing(false)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      toast.error('Kein Zugriff aufs Mikrofon.')
    }
  }

  const generate = async () => {
    if (positions.length > 0 && !confirm('Das bisherige Leistungsverzeichnis wird ersetzt. Fortfahren?')) return
    setIsGenerating(true)
    try {
      const result = await generateLvFromDescription(description, roomSummaries)
      onChange({ lvTitle: result.title, lvPositions: result.positions })
      toast.success(`${result.positions.length} Positionen erzeugt`)
    } catch (error: any) {
      toast.error(error?.message || 'Leistungsverzeichnis konnte nicht erzeugt werden.')
    } finally {
      setIsGenerating(false)
    }
  }

  const updatePosition = (id: string, patch: Partial<LvPosition>) => {
    onChange({ lvPositions: positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  const addPosition = () => {
    const pos: LvPosition = { id: newId('pos'), group: positions[positions.length - 1]?.group || '', shortText: '', quantity: null, unit: 'psch' }
    onChange({ lvPositions: [...positions, pos] })
    setOpenId(pos.id)
  }

  const movePosition = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= positions.length) return
    const next = [...positions]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ lvPositions: next })
  }

  return (
    <>
      <div className="desc-wrap">
        <textarea
          className="desc-input"
          rows={5}
          value={description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Was soll gemacht werden? z. B. Bad komplett neu, alte Fliesen raus, bodengleiche Dusche 90×120, Wände raumhoch fliesen 30×60 …"
        />
        <button
          type="button"
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={isTranscribing}
          aria-label={isRecording ? 'Diktat beenden' : 'Diktieren'}
          title={isRecording ? 'Diktat beenden' : 'Diktieren'}
        >
          {isTranscribing ? '…' : isRecording ? '■' : '🎤'}
        </button>
      </div>

      <button
        type="button"
        className="btn primary-btn full-width"
        onClick={generate}
        disabled={isGenerating || description.trim().length < 10}
      >
        {isGenerating ? 'KI schreibt das Leistungsverzeichnis…' : '✨ Leistungsverzeichnis erzeugen'}
      </button>
      {roomSummaries.length === 0 && (
        <p className="hint">Tipp: Erst die Räume messen – dann setzt die KI die Mengen gleich ein.</p>
      )}

      {positions.length > 0 && (
        <div className="lv-list">
          <input
            className="lv-title"
            value={lvTitle || ''}
            onChange={(e) => onChange({ lvTitle: e.target.value })}
            placeholder="Titel"
            aria-label="Titel des Leistungsverzeichnisses"
          />
          {positions.map((p, i) => {
            const showGroup = p.group && p.group !== positions[i - 1]?.group
            const open = openId === p.id
            return (
              <div key={p.id}>
                {showGroup && <div className="lv-group">{p.group}</div>}
                <div className={`lv-pos ${open ? 'open' : ''}`}>
                  <div className="lv-pos-main">
                    <span className="lv-nr">{i + 1}.</span>
                    <input
                      className="lv-short"
                      value={p.shortText}
                      onChange={(e) => updatePosition(p.id, { shortText: e.target.value })}
                      placeholder="Kurztext"
                      aria-label="Kurztext"
                    />
                    <input
                      className="lv-qty"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={p.quantity ?? ''}
                      onChange={(e) => updatePosition(p.id, { quantity: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      placeholder="Menge"
                      aria-label="Menge"
                    />
                    <select
                      className="lv-unit"
                      value={p.unit}
                      onChange={(e) => updatePosition(p.id, { unit: e.target.value })}
                      aria-label="Einheit"
                    >
                      {[...new Set([...UNITS, p.unit])].map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setOpenId(open ? null : p.id)}
                      aria-label="Details"
                    >
                      {open ? '▴' : '▾'}
                    </button>
                  </div>
                  {open && (
                    <div className="lv-pos-details">
                      <input
                        value={p.group || ''}
                        onChange={(e) => updatePosition(p.id, { group: e.target.value })}
                        placeholder="Abschnitt"
                        aria-label="Abschnitt"
                      />
                      <textarea
                        rows={3}
                        value={p.longText || ''}
                        onChange={(e) => updatePosition(p.id, { longText: e.target.value })}
                        placeholder="Langtext"
                        aria-label="Langtext"
                      />
                      <div className="inline-row">
                        <button type="button" className="btn secondary-btn" onClick={() => movePosition(i, -1)} disabled={i === 0}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn secondary-btn"
                          onClick={() => movePosition(i, 1)}
                          disabled={i === positions.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn secondary-btn"
                          onClick={() => onChange({ lvPositions: positions.filter((x) => x.id !== p.id) })}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <button type="button" className="btn secondary-btn full-width" onClick={addPosition}>
        + Position
      </button>
    </>
  )
}

export default LvSection
