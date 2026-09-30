import type { InspectionRoom, RoomWall } from '../types/inspection'

/**
 * Grundriss aus gemessenen Wänden.
 *
 * Gemessen wird wie mit dem Maßband: an einer Ecke anfangen, Wand für Wand
 * einmal herumlaufen. Jede Wand hat ihre Länge und den Innenwinkel zur
 * nächsten; daraus ergeben sich die Eckpunkte. Die Koordinaten sind die der
 * Skizze (x nach rechts, y nach unten, Meter), die erste Wand läuft nach
 * rechts, der Raum liegt rechts der Laufrichtung.
 */

export interface Point {
  x: number
  y: number
}

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Winkel auf (-180, 180] bringen. */
function normalizeTurn(deg: number): number {
  let d = deg % 360
  if (d <= -180) d += 360
  if (d > 180) d -= 360
  return d
}

/** Eckpunkte entlang der Wände, beginnend bei (0,0). Liefert Wandanzahl + 1 Punkte. */
export function wallPoints(walls: RoomWall[]): Point[] {
  const points: Point[] = [{ x: 0, y: 0 }]
  let heading = 0
  let x = 0
  let y = 0
  for (const wall of walls) {
    x += wall.length * Math.cos(toRad(heading))
    y += wall.length * Math.sin(toRad(heading))
    points.push({ x, y })
    heading += 180 - wall.angle
  }
  return points
}

/** Richtung jeder Wand in Grad (0 = nach rechts). */
export function wallHeadings(walls: RoomWall[]): number[] {
  const headings: number[] = []
  let heading = 0
  for (const wall of walls) {
    headings.push(heading)
    heading += 180 - wall.angle
  }
  return headings
}

/** Wie weit der letzte Punkt vom Anfang entfernt ist – 0 heißt: der Raum ist geschlossen. */
export function closingGap(walls: RoomWall[]): number {
  if (walls.length === 0) return 0
  const points = wallPoints(walls)
  const last = points[points.length - 1]
  return Math.hypot(last.x, last.y)
}

/** Ab dieser Abweichung gilt der Raum als offen (2 cm). */
export const CLOSED_TOLERANCE = 0.02

export function isClosed(walls: RoomWall[]): boolean {
  return walls.length >= 3 && closingGap(walls) <= CLOSED_TOLERANCE
}

/** Die Eckpunkte des Grundrisses (ohne den doppelten Endpunkt). */
export function polygon(walls: RoomWall[]): Point[] {
  const points = wallPoints(walls)
  return walls.length > 0 && closingGap(walls) <= CLOSED_TOLERANCE ? points.slice(0, -1) : points
}

/** Grundfläche nach der Gaußschen Trapezformel; ein offener Raum wird gedanklich geschlossen. */
export function floorArea(walls: RoomWall[]): number {
  const pts = polygon(walls)
  if (pts.length < 3) return 0
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function perimeter(walls: RoomWall[]): number {
  return walls.reduce((sum, wall) => sum + wall.length, 0)
}

/** Wandfläche brutto (Umfang × Höhe), ohne Abzug von Türen und Fenstern. */
export function wallArea(room: Pick<InspectionRoom, 'walls' | 'height'>): number {
  return perimeter(room.walls) * room.height
}

export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** Vier Wände für einen rechteckigen Raum. */
export function rectangleWalls(length: number, width: number): RoomWall[] {
  return [length, width, length, width].map((l) => ({ id: newId('w'), length: l, angle: 90 }))
}

/**
 * Den Raum mit einer letzten Wand zum Ausgangspunkt schließen.
 *
 * Oft misst man alle Wände bis auf die letzte – die ergibt sich. Die neue
 * Wand führt vom letzten Punkt zurück zum Anfang, die Winkel an ihren beiden
 * Enden werden passend gesetzt.
 */
export function closeRoom(walls: RoomWall[]): RoomWall[] {
  if (walls.length < 2) return walls
  const gap = closingGap(walls)
  if (gap <= CLOSED_TOLERANCE) return walls

  const points = wallPoints(walls)
  const last = points[points.length - 1]
  const closingHeading = toDeg(Math.atan2(-last.y, -last.x))
  const headings = wallHeadings(walls)
  const prevHeading = headings[headings.length - 1]

  const turnAtLast = normalizeTurn(closingHeading - prevHeading)
  const turnAtStart = normalizeTurn(0 - closingHeading)

  const updated = walls.map((w, i) =>
    i === walls.length - 1 ? { ...w, angle: round(180 - turnAtLast, 1) } : w
  )
  updated.push({ id: newId('w'), length: round(gap, 3), angle: round(180 - turnAtStart, 1) })
  return updated
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bounds(points: Point[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return points.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  )
}

/** Meter mit Komma, z. B. „2,35 m“. */
export function formatMeters(value: number, digits = 2): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} m`
}

export function formatSquareMeters(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`
}

/** Eingaben wie „2,35“, „2.35“ oder „235 cm“ in Meter umrechnen. */
export function parseMeters(input: string): number | null {
  const raw = input.trim().toLowerCase().replace(',', '.')
  if (!raw) return null
  const match = /^(\d+(?:\.\d+)?)\s*(m|cm|mm)?$/.exec(raw)
  if (!match) return null
  const value = parseFloat(match[1])
  const unit = match[2] || (value >= 20 ? 'cm' : 'm')
  const meters = unit === 'mm' ? value / 1000 : unit === 'cm' ? value / 100 : value
  return meters > 0 ? meters : null
}

/** Kurzfassung eines Raums für die KI und für Übersichten. */
export function roomSummary(room: InspectionRoom): string {
  const parts = [`${room.name || 'Raum'}:`]
  if (room.walls.length >= 3) {
    parts.push(
      `Bodenfläche ${formatSquareMeters(floorArea(room.walls))}`,
      `Umfang ${formatMeters(perimeter(room.walls))}`,
      `Wandfläche brutto ${formatSquareMeters(wallArea(room))} bei ${formatMeters(room.height)} Raumhöhe`
    )
  } else {
    parts.push('noch nicht vermessen')
  }
  if (room.objects.length > 0) {
    parts.push(`Einrichtung: ${room.objects.map((o) => OBJECT_LABELS[o.type]).join(', ')}`)
  }
  if (room.notes.length > 0) {
    parts.push(`Notizen: ${room.notes.map((n) => n.text).join('; ')}`)
  }
  return parts.join(' ')
}

export const OBJECT_LABELS: Record<string, string> = {
  badewanne: 'Badewanne',
  dusche: 'Dusche',
  wc: 'WC',
  waschtisch: 'Waschtisch',
  kueche: 'Küchenzeile',
  tuer: 'Tür',
  fenster: 'Fenster'
}
