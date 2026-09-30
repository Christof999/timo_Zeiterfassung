import { lazy, Suspense, useState } from 'react'
import type { InspectionRoom, RoomObject, RoomObjectType, RoomWall } from '../../types/inspection'
import {
  OBJECT_LABELS,
  bounds,
  closeRoom,
  closingGap,
  floorArea,
  formatMeters,
  formatSquareMeters,
  isClosed,
  newId,
  parseMeters,
  perimeter,
  rectangleWalls,
  round,
  wallArea,
  wallPoints
} from '../../utils/roomGeometry'
import RoomSketch, { type SketchMode } from './RoomSketch'

const Room3D = lazy(() => import('./Room3D'))

/** Standardmaße der Einrichtung in Metern (Breite × Tiefe). */
const OBJECT_DEFAULTS: Record<RoomObjectType, { width: number; depth: number }> = {
  badewanne: { width: 1.7, depth: 0.75 },
  dusche: { width: 0.9, depth: 0.9 },
  wc: { width: 0.38, depth: 0.6 },
  waschtisch: { width: 0.6, depth: 0.45 },
  kueche: { width: 2.4, depth: 0.6 },
  tuer: { width: 0.885, depth: 0.1 },
  fenster: { width: 1.0, depth: 0.1 }
}

const ANGLE_CHOICES = [
  { value: 90, label: 'Ecke 90°' },
  { value: 270, label: 'Vorsprung 90°' },
  { value: 135, label: 'Schräg 135°' }
]

interface RoomEditorProps {
  room: InspectionRoom
  onChange: (room: InspectionRoom) => void
  onDelete: () => void
}

const RoomEditor: React.FC<RoomEditorProps> = ({ room, onChange, onDelete }) => {
  const [view, setView] = useState<'sketch' | '3d'>('sketch')
  const [mode, setMode] = useState<SketchMode>('move')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lengthInput, setLengthInput] = useState('')
  const [angle, setAngle] = useState(90)
  const [editingWall, setEditingWall] = useState<number | null>(null)
  const [rectInput, setRectInput] = useState({ length: '', width: '' })

  const closed = isClosed(room.walls)
  const measuring = !closed
  const update = (patch: Partial<InspectionRoom>) => onChange({ ...room, ...patch })
  const setWalls = (walls: RoomWall[]) => update({ walls })

  // --- Messen ------------------------------------------------------------

  const addWall = () => {
    const length = parseMeters(lengthInput)
    if (!length) return
    setWalls([...room.walls, { id: newId('w'), length: round(length, 3), angle }])
    setLengthInput('')
    setAngle(90)
  }

  const applyRectangle = () => {
    const l = parseMeters(rectInput.length)
    const w = parseMeters(rectInput.width)
    if (!l || !w) return
    if (room.walls.length > 0 && !confirm('Die bisherigen Wände werden ersetzt. Fortfahren?')) return
    setWalls(rectangleWalls(round(l, 3), round(w, 3)))
    setRectInput({ length: '', width: '' })
  }

  const updateWall = (index: number, patch: Partial<RoomWall>) => {
    setWalls(room.walls.map((w, i) => (i === index ? { ...w, ...patch } : w)))
  }

  const removeWall = (index: number) => {
    setWalls(room.walls.filter((_, i) => i !== index))
    setEditingWall(null)
  }

  // --- Einrichtung & Notizen -------------------------------------------

  const roomCenter = () => {
    const b = bounds(wallPoints(room.walls))
    return room.walls.length ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 1, y: 1 }
  }

  const addObject = (type: RoomObjectType) => {
    const c = roomCenter()
    // Nicht alles auf denselben Fleck stapeln: jedes weitere Objekt etwas versetzt.
    const offset = (room.objects.length % 5) * 0.25
    const obj: RoomObject = {
      id: newId('o'),
      type,
      x: round(c.x + offset),
      y: round(c.y + offset),
      rotation: 0,
      ...OBJECT_DEFAULTS[type]
    }
    update({ objects: [...room.objects, obj] })
    setSelectedId(obj.id)
    setMode('move')
  }

  const updateObject = (id: string, patch: Partial<RoomObject>) => {
    update({ objects: room.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  }

  const addNote = (x: number, y: number) => {
    const text = prompt('Notiz an dieser Stelle:')?.trim()
    if (!text) return
    const note = { id: newId('n'), x, y, text }
    update({ notes: [...room.notes, note] })
    setSelectedId(note.id)
  }

  const selectedObject = room.objects.find((o) => o.id === selectedId)
  const selectedNote = room.notes.find((n) => n.id === selectedId)
  const gap = closingGap(room.walls)

  return (
    <div className="room-editor">
      <div className="room-editor-head">
        <input
          className="room-name-input"
          value={room.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Raumname, z. B. Bad OG"
          aria-label="Raumname"
        />
        <label className="room-height">
          Höhe
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="1"
            value={room.height}
            onChange={(e) => update({ height: Math.max(0.5, parseFloat(e.target.value) || 2.5) })}
          />
          m
        </label>
        <button type="button" className="icon-btn danger" onClick={onDelete} title="Raum löschen" aria-label="Raum löschen">
          🗑
        </button>
      </div>

      {room.walls.length >= 3 && (
        <div className="room-stats">
          <span>Boden <strong>{formatSquareMeters(floorArea(room.walls))}</strong></span>
          <span>Wände <strong>{formatSquareMeters(wallArea(room))}</strong></span>
          <span>Umfang <strong>{formatMeters(perimeter(room.walls))}</strong></span>
        </div>
      )}

      <div className="segmented">
        <button type="button" className={view === 'sketch' ? 'active' : ''} onClick={() => setView('sketch')}>
          Skizze
        </button>
        <button
          type="button"
          className={view === '3d' ? 'active' : ''}
          onClick={() => setView('3d')}
          disabled={room.walls.length < 3}
        >
          3D
        </button>
      </div>

      {view === 'sketch' ? (
        <>
          <div className="sketch-wrap">
            {room.walls.length === 0 ? (
              <div className="sketch-empty">
                <p>Wand für Wand einmal um den Raum herum messen – oder unten ein Rechteck eingeben.</p>
              </div>
            ) : (
              <RoomSketch
                room={room}
                mode={mode}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onEditWall={(i) => setEditingWall(i)}
                onMoveObject={(id, x, y) => updateObject(id, { x, y })}
                onAddNote={addNote}
              />
            )}
          </div>
          {room.walls.length > 0 && (
            <div className="segmented small">
              <button type="button" className={mode === 'move' ? 'active' : ''} onClick={() => setMode('move')}>
                ✋ Verschieben
              </button>
              <button type="button" className={mode === 'note' ? 'active' : ''} onClick={() => setMode('note')}>
                📝 Notiz setzen
              </button>
            </div>
          )}
          {mode === 'note' && <p className="hint">Tippe in die Skizze, wo die Notiz hin soll.</p>}
        </>
      ) : (
        <Suspense fallback={<div className="room-3d loading">3D wird geladen…</div>}>
          <Room3D room={room} />
        </Suspense>
      )}

      {editingWall !== null && room.walls[editingWall] && (
        <div className="inline-panel">
          <strong>Wand {editingWall + 1}</strong>
          <div className="inline-row">
            <label>
              Länge (m)
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={room.walls[editingWall].length}
                onChange={(e) => updateWall(editingWall, { length: Math.max(0.01, parseFloat(e.target.value) || 0) })}
              />
            </label>
            <label>
              Winkel danach (°)
              <input
                type="number"
                inputMode="decimal"
                step="1"
                value={room.walls[editingWall].angle}
                onChange={(e) => updateWall(editingWall, { angle: parseFloat(e.target.value) || 90 })}
              />
            </label>
          </div>
          <div className="inline-row">
            <button type="button" className="btn secondary-btn" onClick={() => removeWall(editingWall)}>
              Wand entfernen
            </button>
            <button type="button" className="btn primary-btn" onClick={() => setEditingWall(null)}>
              Fertig
            </button>
          </div>
        </div>
      )}

      {selectedObject && (
        <div className="inline-panel">
          <strong>{OBJECT_LABELS[selectedObject.type]}</strong>
          <div className="inline-row">
            <label>
              Breite (m)
              <input
                type="number"
                inputMode="decimal"
                step="0.05"
                value={selectedObject.width}
                onChange={(e) => updateObject(selectedObject.id, { width: Math.max(0.05, parseFloat(e.target.value) || 0) })}
              />
            </label>
            <label>
              Tiefe (m)
              <input
                type="number"
                inputMode="decimal"
                step="0.05"
                value={selectedObject.depth}
                onChange={(e) => updateObject(selectedObject.id, { depth: Math.max(0.02, parseFloat(e.target.value) || 0) })}
              />
            </label>
          </div>
          <div className="inline-row">
            <button
              type="button"
              className="btn secondary-btn"
              onClick={() => updateObject(selectedObject.id, { rotation: (selectedObject.rotation + 90) % 360 })}
            >
              ↻ Drehen
            </button>
            <button
              type="button"
              className="btn secondary-btn"
              onClick={() => {
                update({ objects: room.objects.filter((o) => o.id !== selectedObject.id) })
                setSelectedId(null)
              }}
            >
              Entfernen
            </button>
          </div>
          <p className="hint">Die dicke Kante ist die Rückseite – sie gehört an die Wand.</p>
        </div>
      )}

      {selectedNote && (
        <div className="inline-panel">
          <strong>Notiz {room.notes.indexOf(selectedNote) + 1}</strong>
          <textarea
            rows={2}
            value={selectedNote.text}
            onChange={(e) =>
              update({ notes: room.notes.map((n) => (n.id === selectedNote.id ? { ...n, text: e.target.value } : n)) })
            }
          />
          <div className="inline-row">
            <button
              type="button"
              className="btn secondary-btn"
              onClick={() => {
                update({ notes: room.notes.filter((n) => n.id !== selectedNote.id) })
                setSelectedId(null)
              }}
            >
              Notiz löschen
            </button>
            <button type="button" className="btn primary-btn" onClick={() => setSelectedId(null)}>
              Fertig
            </button>
          </div>
        </div>
      )}

      {measuring && (
        <div className="measure-panel">
          <div className="measure-title">
            <strong>Wand {room.walls.length + 1} messen</strong>
            {room.walls.length >= 2 && gap > 0.02 && <span className="hint">Abstand zum Start: {formatMeters(gap)}</span>}
          </div>
          <div className="measure-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Länge, z. B. 2,35"
              value={lengthInput}
              onChange={(e) => setLengthInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWall()}
              aria-label="Wandlänge"
            />
            <button type="button" className="btn primary-btn" onClick={addWall} disabled={!parseMeters(lengthInput)}>
              Wand setzen
            </button>
          </div>
          <div className="chip-row">
            <span className="chip-label">Danach:</span>
            {ANGLE_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`chip ${angle === c.value ? 'active' : ''}`}
                onClick={() => setAngle(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="inline-row">
            {room.walls.length >= 2 && (
              <button type="button" className="btn secondary-btn" onClick={() => setWalls(closeRoom(room.walls))}>
                Raum schließen
              </button>
            )}
            {room.walls.length > 0 && (
              <button type="button" className="btn secondary-btn" onClick={() => setWalls(room.walls.slice(0, -1))}>
                ↶ Letzte Wand
              </button>
            )}
          </div>
          {room.walls.length === 0 && (
            <div className="rect-quick">
              <span className="chip-label">Oder rechteckig:</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Länge"
                value={rectInput.length}
                onChange={(e) => setRectInput({ ...rectInput, length: e.target.value })}
                aria-label="Raumlänge"
              />
              <span>×</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Breite"
                value={rectInput.width}
                onChange={(e) => setRectInput({ ...rectInput, width: e.target.value })}
                aria-label="Raumbreite"
              />
              <button type="button" className="btn secondary-btn" onClick={applyRectangle}>
                Übernehmen
              </button>
            </div>
          )}
        </div>
      )}

      {closed && (
        <div className="object-palette">
          <span className="chip-label">Einrichtung:</span>
          {(Object.keys(OBJECT_DEFAULTS) as RoomObjectType[]).map((type) => (
            <button key={type} type="button" className="chip" onClick={() => addObject(type)}>
              + {OBJECT_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {closed && room.walls.length > 0 && (
        <details className="wall-list">
          <summary>Wände bearbeiten ({room.walls.length})</summary>
          <ol>
            {room.walls.map((w, i) => (
              <li key={w.id}>
                <button type="button" className="link-btn" onClick={() => setEditingWall(i)}>
                  Wand {i + 1}: {formatMeters(w.length)}, danach {w.angle}°
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}

      {room.notes.length > 0 && (
        <ol className="note-list">
          {room.notes.map((n) => (
            <li key={n.id}>
              <button type="button" className="link-btn" onClick={() => setSelectedId(n.id)}>
                {n.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default RoomEditor
