import { useMemo, useRef, useState } from 'react'
import type { InspectionRoom, RoomObject } from '../../types/inspection'
import {
  CLOSED_TOLERANCE,
  OBJECT_LABELS,
  bounds,
  closingGap,
  formatMeters,
  wallHeadings,
  wallPoints
} from '../../utils/roomGeometry'

export type SketchMode = 'move' | 'note'

interface RoomSketchProps {
  room: InspectionRoom
  mode: SketchMode
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEditWall: (index: number) => void
  onMoveObject: (id: string, x: number, y: number) => void
  onAddNote: (x: number, y: number) => void
}

const PADDING = 0.9

/**
 * Grundriss als SVG, Einheit Meter. Wände mit Maßen (antippen = ändern),
 * Einrichtung zum Verschieben und nummerierte Notizen.
 */
const RoomSketch: React.FC<RoomSketchProps> = ({
  room,
  mode,
  selectedId,
  onSelect,
  onEditWall,
  onMoveObject,
  onAddNote
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)

  const points = useMemo(() => wallPoints(room.walls), [room.walls])
  const headings = useMemo(() => wallHeadings(room.walls), [room.walls])
  const gap = closingGap(room.walls)
  const closed = room.walls.length >= 3 && gap <= CLOSED_TOLERANCE

  const view = useMemo(() => {
    const extra = [
      ...room.objects.flatMap((o) => {
        const r = Math.max(o.width, o.depth) / 2
        return [
          { x: o.x - r, y: o.y - r },
          { x: o.x + r, y: o.y + r }
        ]
      }),
      ...room.notes.map((n) => ({ x: n.x, y: n.y }))
    ]
    const b = bounds([...points, ...extra])
    const width = Math.max(b.maxX - b.minX, 2)
    const height = Math.max(b.maxY - b.minY, 2)
    return {
      x: b.minX - PADDING - (width - (b.maxX - b.minX)) / 2,
      y: b.minY - PADDING - (height - (b.maxY - b.minY)) / 2,
      width: width + PADDING * 2,
      height: height + PADDING * 2
    }
  }, [points, room.objects, room.notes])

  // Schrift und Striche mitwachsen lassen, damit große Räume nicht winzig beschriftet sind.
  const unit = Math.max(view.width, view.height) / 20

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const p = pt.matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }

  const handleBackgroundClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && !(e.target as Element).classList.contains('sketch-floor')) return
    if (mode === 'note') {
      const p = toSvg(e.clientX, e.clientY)
      onAddNote(Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100)
      return
    }
    onSelect(null)
  }

  const startDrag = (e: React.PointerEvent, obj: RoomObject) => {
    e.stopPropagation()
    onSelect(obj.id)
    if (mode !== 'move') return
    const p = toSvg(e.clientX, e.clientY)
    dragRef.current = { id: obj.id, dx: p.x - obj.x, dy: p.y - obj.y, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const p = toSvg(e.clientX, e.clientY)
    drag.moved = true
    setDragPos({ id: drag.id, x: p.x - drag.dx, y: p.y - drag.dy })
  }

  const endDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.moved && dragPos && dragPos.id === drag.id) {
      // Auf 5 cm runden – genauer schiebt niemand mit dem Finger.
      onMoveObject(drag.id, Math.round(dragPos.x * 20) / 20, Math.round(dragPos.y * 20) / 20)
    }
    setDragPos(null)
  }

  const polygonPoints = (closed ? points.slice(0, -1) : points).map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      ref={svgRef}
      className={`room-sketch mode-${mode}`}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      onClick={handleBackgroundClick}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <defs>
        <pattern id={`grid-${room.id}`} width="0.5" height="0.5" patternUnits="userSpaceOnUse">
          <path d="M 0.5 0 L 0 0 0 0.5" fill="none" className="sketch-grid" strokeWidth={unit * 0.03} />
        </pattern>
      </defs>
      <rect
        x={view.x}
        y={view.y}
        width={view.width}
        height={view.height}
        fill={`url(#grid-${room.id})`}
        pointerEvents="none"
      />

      {room.walls.length >= 2 && (
        <polygon points={polygonPoints} className="sketch-floor" />
      )}

      {room.walls.map((wall, i) => {
        const a = points[i]
        const b = points[i + 1]
        const h = (headings[i] * Math.PI) / 180
        // Außen liegt links der Laufrichtung.
        const nx = Math.sin(h)
        const ny = -Math.cos(h)
        const mx = (a.x + b.x) / 2 + nx * unit * 0.9
        const my = (a.y + b.y) / 2 + ny * unit * 0.9
        let textAngle = headings[i] % 360
        if (textAngle < 0) textAngle += 360
        if (textAngle > 90 && textAngle < 270) textAngle -= 180
        return (
          <g key={wall.id} className="sketch-wall" onClick={(e) => { e.stopPropagation(); onEditWall(i) }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={unit * 0.35} className="sketch-wall-line" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={unit * 1.6} stroke="transparent" />
            <text
              x={mx}
              y={my}
              fontSize={unit * 0.75}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${textAngle} ${mx} ${my})`}
              className="sketch-dimension"
            >
              {formatMeters(wall.length)}
            </text>
          </g>
        )
      })}

      {!closed && room.walls.length >= 2 && (
        <line
          x1={points[points.length - 1].x}
          y1={points[points.length - 1].y}
          x2={0}
          y2={0}
          strokeWidth={unit * 0.12}
          strokeDasharray={`${unit * 0.4} ${unit * 0.3}`}
          className="sketch-gap"
        />
      )}

      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={unit * 0.28} className={i === 0 ? 'sketch-corner start' : 'sketch-corner'} />
      ))}

      {room.objects.map((obj) => {
        const pos = dragPos?.id === obj.id ? dragPos : obj
        return (
          <g
            key={obj.id}
            transform={`translate(${pos.x} ${pos.y}) rotate(${obj.rotation})`}
            className={`sketch-object type-${obj.type} ${selectedId === obj.id ? 'selected' : ''}`}
            onPointerDown={(e) => startDrag(e, obj)}
            onClick={(e) => e.stopPropagation()}
          >
            <rect
              x={-obj.width / 2}
              y={-obj.depth / 2}
              width={obj.width}
              height={obj.depth}
              rx={obj.type === 'wc' || obj.type === 'waschtisch' ? Math.min(obj.width, obj.depth) * 0.2 : 0.03}
              strokeWidth={unit * 0.1}
            />
            {/* Rückseite markieren: daran steht das Objekt an der Wand */}
            <line
              x1={-obj.width / 2}
              y1={-obj.depth / 2}
              x2={obj.width / 2}
              y2={-obj.depth / 2}
              strokeWidth={unit * 0.25}
              className="sketch-object-back"
            />
            <text
              fontSize={unit * 0.55}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${-obj.rotation})`}
              pointerEvents="none"
            >
              {OBJECT_LABELS[obj.type]}
            </text>
          </g>
        )
      })}

      {room.notes.map((note, i) => (
        <g
          key={note.id}
          transform={`translate(${note.x} ${note.y})`}
          className={`sketch-note ${selectedId === note.id ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(note.id)
          }}
        >
          <circle r={unit * 0.6} />
          <text fontSize={unit * 0.7} textAnchor="middle" dominantBaseline="central">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default RoomSketch
