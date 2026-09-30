import { describe, expect, it } from 'vitest'
import {
  closeRoom,
  closingGap,
  floorArea,
  isClosed,
  parseMeters,
  perimeter,
  rectangleWalls,
  wallArea,
  wallPoints
} from './roomGeometry'

const wall = (length: number, angle = 90) => ({ id: `w${length}`, length, angle })

describe('roomGeometry', () => {
  it('schließt ein Rechteck und berechnet Fläche und Umfang', () => {
    const walls = rectangleWalls(4, 2.5)
    expect(isClosed(walls)).toBe(true)
    expect(floorArea(walls)).toBeCloseTo(10)
    expect(perimeter(walls)).toBeCloseTo(13)
    expect(wallArea({ walls, height: 2.5 })).toBeCloseTo(32.5)
  })

  it('legt die Wände im Uhrzeigersinn der Skizze an', () => {
    const points = wallPoints(rectangleWalls(4, 2))
    expect(points[1].x).toBeCloseTo(4)
    expect(points[1].y).toBeCloseTo(0)
    expect(points[2].x).toBeCloseTo(4)
    expect(points[2].y).toBeCloseTo(2)
  })

  it('berechnet die L-Form', () => {
    // 4 x 3 mit einer 1 x 1 Ecke ausgespart
    const walls = [wall(4), wall(2), wall(1, 270), wall(1), wall(3), wall(3)]
    expect(isClosed(walls)).toBe(true)
    expect(floorArea(walls)).toBeCloseTo(11)
  })

  it('ergänzt die fehlende letzte Wand', () => {
    const open = [wall(4), wall(2.5), wall(4)]
    expect(closingGap(open)).toBeCloseTo(2.5)
    const closed = closeRoom(open)
    expect(closed).toHaveLength(4)
    expect(closed[3].length).toBeCloseTo(2.5)
    expect(closed[3].angle).toBeCloseTo(90)
    expect(isClosed(closed)).toBe(true)
  })

  it('schließt auch schiefe Räume', () => {
    const open = [wall(4), wall(3), wall(3)]
    const closed = closeRoom(open)
    expect(isClosed(closed)).toBe(true)
    expect(closed[3].length).toBeCloseTo(Math.hypot(1, 3), 2)
  })

  it('liest Maßangaben', () => {
    expect(parseMeters('2,35')).toBeCloseTo(2.35)
    expect(parseMeters('235 cm')).toBeCloseTo(2.35)
    expect(parseMeters('235')).toBeCloseTo(2.35)
    expect(parseMeters('2350mm')).toBeCloseTo(2.35)
    expect(parseMeters('abc')).toBeNull()
  })
})
