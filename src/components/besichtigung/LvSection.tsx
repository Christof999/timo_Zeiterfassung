import { useEffect, useMemo, useRef, useState } from 'react'
import type { LvPosition } from '../../types/inspection'
import { generateLvFromDescription, transcribe } from '../../services/inspectionAi'
import { getArticleCatalog } from '../../services/data/inspections'
import { bestArticleMatch, type CatalogArticle } from '../../utils/articleMatch'
import { blobToDataUrl } from '../../utils/imageFile'
import { newId } from '../../utils/roomGeometry'
import SearchableSelect from '../SearchableSelect'
import { toast } from '../ToastContainer'

const UNITS = ['m²', 'm', 'Stk', 'psch', 'h']
const NO_ARTICLE = '__none__'

type LvPatch = { description?: string; lvTitle?: string; lvText?: string; lvPositions?: LvPosition[] }

interface LvSectionProps {
  description: string
  lvTitle?: string
  lvText?: string
  positions: LvPosition[]
  roomSummaries: string[]
  onChange: (patch: LvPatch) => void
}

/**
 * Positionen ohne Artikel gegen den Artikelstamm prüfen und sichere Treffer
 * eintragen. Bereits zugeordnete Positionen bleiben, wie sie sind.
 */
function linkArticles(positions: LvPosition[], catalog: CatalogArticle[]): { positions: LvPosition[]; linked: number } {
  let linked = 0
  const next = positions.map((p) => {
    if (p.articleId) return p
    const match = bestArticleMatch(`${p.shortText} ${p.longText || ''}`, catalog)
    if (!match) return p
    linked++
    return { ...p, articleId: match.id, articleName: match.name, unit: match.unit || p.unit }
  })
  return { positions: next, linked }
}

const LvSection: React.FC<LvSectionProps> = ({ description, lvTitle, lvText, positions, roomSummaries, onChange }) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CatalogArticle[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    getArticleCatalog()
      .then(setCatalog)
      .catch((error) => console.warn('Artikelstamm konnte nicht geladen werden:', error))
  }, [])

  const catalogById = useMemo(() => new Map(catalog.map((a) => [a.id, a])), [catalog])
  const articleOptions = useMemo(
    () => [
      { value: NO_ARTICLE, label: '— kein Artikel (freie Position) —' },
      ...catalog.map((a) => ({
        value: a.id,
        label: [a.articleNumber, a.name, a.unit ? `(${a.unit})` : ''].filter(Boolean).join(' ')
      }))
    ],
    [catalog]
  )
  const itemPositions = positions.filter((p) => p.shortText.trim())
  const linkedCount = itemPositions.filter((p) => p.articleId && catalogById.has(p.articleId)).length

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
      const result = await generateLvFromDescription(description, roomSummaries, catalog)
      // Was die KI nicht zuordnen konnte, noch einmal selbst gegen den Stamm prüfen.
      const { positions: checked } = linkArticles(result.positions, catalog)
      onChange({ lvTitle: result.title, lvText: result.text, lvPositions: checked })
      const withArticle = checked.filter((p) => p.articleId).length
      toast.success(`${checked.length} Positionen erzeugt, ${withArticle} davon mit Artikel aus dem Stamm`)
    } catch (error: any) {
      toast.error(error?.message || 'Leistungsverzeichnis konnte nicht erzeugt werden.')
    } finally {
      setIsGenerating(false)
    }
  }

  const updatePosition = (id: string, patch: Partial<LvPosition>) => {
    onChange({ lvPositions: positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  const setArticle = (position: LvPosition, articleId: string) => {
    if (articleId === NO_ARTICLE) {
      updatePosition(position.id, { articleId: undefined, articleName: undefined })
      return
    }
    const article = catalogById.get(articleId)
    if (!article) return
    updatePosition(position.id, { articleId: article.id, articleName: article.name, unit: article.unit || position.unit })
  }

  const checkArticles = () => {
    const { positions: next, linked } = linkArticles(positions, catalog)
    if (linked > 0) onChange({ lvPositions: next })
    toast.success(linked > 0 ? `${linked} weitere Positionen zugeordnet` : 'Keine weiteren sicheren Treffer im Artikelstamm')
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

      {(lvText || positions.length > 0) && (
        <details className="lv-text" open={!!lvText}>
          <summary>Leistungsbeschreibung (Text fürs Angebot)</summary>
          <textarea
            rows={12}
            value={lvText || ''}
            onChange={(e) => onChange({ lvText: e.target.value })}
            placeholder="Ausformulierte Beschreibung der Arbeiten – entsteht beim Erzeugen des Leistungsverzeichnisses."
            aria-label="Leistungsbeschreibung"
          />
        </details>
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
          <div className={`lv-check ${linkedCount === itemPositions.length ? 'complete' : ''}`}>
            <span>
              📦 {linkedCount} von {itemPositions.length} Positionen mit Artikel aus dem Stamm
              {catalog.length === 0 && ' (Artikelstamm nicht geladen)'}
            </span>
            {linkedCount < itemPositions.length && catalog.length > 0 && (
              <button type="button" className="link-btn" onClick={checkArticles}>
                Abgleichen
              </button>
            )}
          </div>
          {positions.map((p, i) => {
            const showGroup = p.group && p.group !== positions[i - 1]?.group
            const open = openId === p.id
            const article = p.articleId ? catalogById.get(p.articleId) : undefined
            // Artikel im Stamm gelöscht? Nur melden, wenn der Stamm auch wirklich geladen ist.
            const missing = !!p.articleId && catalog.length > 0 && !article
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
                  {p.shortText.trim() && (
                    <button
                      type="button"
                      className={`lv-article ${missing ? 'missing' : article ? 'linked' : 'free'}`}
                      onClick={() => setOpenId(p.id)}
                    >
                      {missing
                        ? `⚠ Artikel „${p.articleName || p.articleId}“ nicht mehr im Stamm`
                        : article
                          ? `📦 ${article.articleNumber ? `${article.articleNumber} · ` : ''}${article.name}`
                          : '＋ kein Artikel – zuordnen'}
                    </button>
                  )}
                  {open && (
                    <div className="lv-pos-details">
                      {catalog.length > 0 && (
                        <SearchableSelect
                          options={articleOptions}
                          value={p.articleId && article ? p.articleId : NO_ARTICLE}
                          onChange={(value) => setArticle(p, value)}
                          placeholder="Artikel aus dem Stamm"
                          searchPlaceholder="Artikel suchen…"
                        />
                      )}
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
