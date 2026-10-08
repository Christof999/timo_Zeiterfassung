import { describe, it, expect } from 'vitest'
import { countSiteTrips, siteTripFlatRateTotal, type SiteTripEntry } from './siteTrips'

/** Einstempeln am Tag `tag` (Oktober 2026) um hh:mm auf ein Projekt. */
const stempel = (
  employeeId: string,
  projectId: string | null,
  tag: number,
  hh: number,
  mm: number,
  customerId?: string
): SiteTripEntry => ({
  employeeId,
  projectId,
  customerId,
  clockInTime: new Date(2026, 9, tag, hh, mm)
})

describe('countSiteTrips', () => {
  it('zählt jedes Einstempeln eines einzelnen Mitarbeiters an verschiedenen Tagen', () => {
    const trips = countSiteTrips('A', [
      stempel('m1', 'A', 5, 7, 0),
      stempel('m1', 'A', 6, 7, 0),
      stempel('m1', 'A', 7, 7, 0)
    ])
    expect(trips).toHaveLength(3)
  })

  it('fasst zwei Mitarbeiter innerhalb von 10 Minuten zu einer Anfahrt zusammen', () => {
    const trips = countSiteTrips('A', [stempel('m1', 'A', 5, 7, 0), stempel('m2', 'A', 5, 7, 8)])
    expect(trips).toHaveLength(1)
    expect(trips[0].employeeIds).toEqual(['m1', 'm2'])
  })

  it('zählt genau 10 Minuten Abstand noch als gemeinsame Fahrt, 11 nicht mehr', () => {
    expect(
      countSiteTrips('A', [stempel('m1', 'A', 5, 7, 0), stempel('m2', 'A', 5, 7, 10)])
    ).toHaveLength(1)
    expect(
      countSiteTrips('A', [stempel('m1', 'A', 5, 7, 0), stempel('m2', 'A', 5, 7, 11)])
    ).toHaveLength(2)
  })

  it('misst ab dem Ersten der Gruppe – keine Kette über 20 Minuten', () => {
    // 7:00, 7:09, 7:18: der Dritte ist 18 Min nach dem Ersten da, also eigenes Auto.
    const trips = countSiteTrips('A', [
      stempel('m1', 'A', 5, 7, 0),
      stempel('m2', 'A', 5, 7, 9),
      stempel('m3', 'A', 5, 7, 18)
    ])
    expect(trips.map((t) => t.employeeIds)).toEqual([['m1', 'm2'], ['m3']])
  })

  it('zählt Ausstempeln zur Pause und wieder rein nicht doppelt', () => {
    const trips = countSiteTrips('A', [stempel('m1', 'A', 5, 7, 0), stempel('m1', 'A', 5, 13, 0)])
    expect(trips).toHaveLength(1)
  })

  it('zählt die Rückkehr nach einem Baustellenwechsel als neue Anfahrt', () => {
    const trips = countSiteTrips('A', [
      stempel('m1', 'A', 5, 7, 0),
      stempel('m1', 'B', 5, 10, 0),
      stempel('m1', 'A', 5, 13, 0)
    ])
    expect(trips).toHaveLength(2)
  })

  it('wertet einen Kleinauftrag dazwischen als Wechsel', () => {
    const trips = countSiteTrips('A', [
      stempel('m1', 'A', 5, 7, 0),
      stempel('m1', null, 5, 10, 0, 'kunde-1'),
      stempel('m1', 'A', 5, 13, 0)
    ])
    expect(trips).toHaveLength(2)
  })

  it('zählt nur Anfahrten auf das gefragte Projekt', () => {
    const trips = countSiteTrips('A', [
      stempel('m1', 'B', 5, 7, 0),
      stempel('m1', 'A', 5, 12, 0),
      stempel('m2', 'B', 5, 7, 0)
    ])
    expect(trips).toHaveLength(1)
    expect(trips[0].employeeIds).toEqual(['m1'])
  })

  it('trennt Fahrgemeinschaften verschiedener Tage', () => {
    const trips = countSiteTrips('A', [stempel('m1', 'A', 5, 7, 0), stempel('m2', 'A', 6, 7, 3)])
    expect(trips).toHaveLength(2)
  })

  it('kommt mit ungeordneten und leeren Eingaben klar', () => {
    expect(countSiteTrips('A', [])).toEqual([])
    const trips = countSiteTrips('A', [
      stempel('m2', 'A', 5, 7, 5),
      stempel('m1', 'A', 6, 7, 0),
      stempel('m1', 'A', 5, 7, 0)
    ])
    expect(trips.map((t) => t.dateKey)).toEqual(['2026-10-05', '2026-10-06'])
    expect(trips[0].employeeIds).toEqual(['m1', 'm2'])
  })

  it('rechnet das Beispiel des Kunden: 17 Anfahrten', () => {
    // 15 Tage zu zweit im selben Auto, an zwei Tagen kommt ein Dritter später nach.
    const entries: SiteTripEntry[] = []
    for (let tag = 1; tag <= 15; tag++) {
      entries.push(stempel('m1', 'A', tag, 7, 0), stempel('m2', 'A', tag, 7, 4))
    }
    entries.push(stempel('m3', 'A', 3, 9, 30), stempel('m3', 'A', 9, 10, 15))
    expect(countSiteTrips('A', entries)).toHaveLength(17)
  })
})

describe('siteTripFlatRateTotal', () => {
  it('multipliziert Anfahrten mit der Pauschale', () => {
    expect(siteTripFlatRateTotal(17, 25)).toBe(425)
    expect(siteTripFlatRateTotal(3, 12.5)).toBe(37.5)
  })

  it('bleibt bei fehlender Pauschale bei 0', () => {
    expect(siteTripFlatRateTotal(17, 0)).toBe(0)
    expect(siteTripFlatRateTotal(0, 25)).toBe(0)
  })
})
