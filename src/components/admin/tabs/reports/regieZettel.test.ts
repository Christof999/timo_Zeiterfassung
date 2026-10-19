import { describe, expect, it } from 'vitest'
import type { Employee, MaterialCredit, TimeEntry } from '../../../../types'
import type { SiteTrip } from '../../../../utils/siteTrips'
import {
  buildRegieDaySheets,
  buildRegieZettelHtml,
  isRegieSignatureOutdated,
  safeSignatureDataUrl
} from './regieZettel'

const tag = (day: number, hour: number, minute = 0): Date => new Date(2026, 9, day, hour, minute)

const stempel = (overrides: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e1',
    employeeId: 'm1',
    projectId: 'p1',
    clockInTime: tag(14, 8),
    clockOutTime: tag(14, 16),
    ...overrides
  }) as TimeEntry

const mitarbeiter = (overrides: Partial<Employee> = {}): Employee =>
  ({
    id: 'm1',
    username: 'max',
    name: 'Max Huber',
    hourlyRate: 50,
    hourlyCostRate: 17.33,
    ancillaryWageCosts: 4.17,
    ...overrides
  }) as Employee

describe('buildRegieDaySheets', () => {
  it('rechnet den Tag nur mit Verkaufspreis und lässt Lücken aus', () => {
    const sheets = buildRegieDaySheets({
      entries: [
        stempel({
          notes: 'Bad gespachtelt',
          materialUsages: [
            { materialTypeId: 'fliese', materialName: 'Fliese', unitLabel: 'm²', quantity: 3, unitPriceEur: 12.5 }
          ]
        }),
        stempel({
          id: 'e2',
          employeeId: 'm2',
          clockInTime: tag(14, 8),
          clockOutTime: tag(14, 10),
          liveDocumentation: [
            {
              notes: 'Sockel gesetzt',
              photoCount: 0,
              documentCount: 0,
              addedBy: 'm2',
              addedByName: 'Lea Kurz',
              timestamp: tag(14, 10)
            }
          ]
        }),
        stempel({
          id: 'e3',
          clockInTime: tag(16, 7),
          clockOutTime: tag(16, 12)
        }),
        stempel({ id: 'offen', clockOutTime: null }),
        stempel({ id: 'urlaub', isVacationDay: true, clockInTime: tag(15, 8), clockOutTime: tag(15, 16) })
      ],
      employees: [
        mitarbeiter(),
        mitarbeiter({ id: 'm2', name: 'Lea Kurz', hourlyRate: 40, hourlyCostRate: 21.5 })
      ],
      siteTrips: [{ dateKey: '2026-10-14', startedAt: tag(14, 8), employeeIds: ['m1', 'm2'] }],
      siteTripRate: 25
    })

    expect(sheets.map((sheet) => sheet.dateKey)).toEqual(['2026-10-14', '2026-10-16'])

    const mittwoch = sheets[0]
    expect(mittwoch.entryIds).toEqual(['e1', 'e2'])
    expect(mittwoch.labor).toMatchObject([
      { employeeName: 'Max Huber', hours: 8, hourlyRate: 50, lineTotal: 400 },
      { employeeName: 'Lea Kurz', hours: 2, hourlyRate: 40, lineTotal: 80 }
    ])
    expect(mittwoch.workNotes).toEqual(['Max Huber: Bad gespachtelt', 'Lea Kurz: Sockel gesetzt'])
    expect(mittwoch.materials).toEqual([
      { name: 'Fliese', quantity: 3, unitLabel: 'm²', unitPriceEur: 12.5, lineTotal: 37.5 }
    ])
    expect(mittwoch.tripCount).toBe(1)
    expect(mittwoch.tripTotal).toBe(25)
    expect(mittwoch.laborTotal).toBe(480)
    expect(mittwoch.materialTotal).toBe(37.5)
    expect(mittwoch.dayTotal).toBe(542.5)
    expect(sheets[1].dayTotal).toBe(5 * 50)
  })

  it('zählt aufgefüllte Überstunden nicht, Pause schon, Rückfahrt auch', () => {
    const [aufgefuellt] = buildRegieDaySheets({
      entries: [stempel({ clockOutTime: tag(14, 14), overtimeFillMinutes: 120 })],
      employees: [mitarbeiter()]
    })
    expect(aufgefuellt.labor[0].hours).toBe(6)

    const [mitPause] = buildRegieDaySheets({
      entries: [stempel({ pauseTotalTime: 30 * 60 * 1000 })],
      employees: [mitarbeiter()]
    })
    expect(mitPause.labor[0].hours).toBe(7.5)

    const [mitFahrt] = buildRegieDaySheets({
      entries: [stempel({ returnTravelCreditMs: 15 * 60 * 1000 })],
      employees: [mitarbeiter()]
    })
    expect(mitFahrt.labor[0].hours).toBe(8.25)
    expect(mitFahrt.labor[0].lineTotal).toBe(412.5)
  })

  it('nimmt nachgetragenen Verbrauch mit, Gutschriften nicht', () => {
    const verbrauch: MaterialCredit = {
      id: 'c1',
      projectId: 'p1',
      kind: 'consumption',
      materialName: 'Kleber',
      unitLabel: 'Sack',
      quantity: 2,
      unitPriceEur: 18,
      createdAt: tag(15, 11)
    }
    const gutschrift: MaterialCredit = {
      ...verbrauch,
      id: 'c2',
      kind: 'credit',
      quantity: 9,
      unitPriceEur: 99,
      createdAt: tag(14, 18)
    }
    const sheets = buildRegieDaySheets({
      entries: [stempel()],
      employees: [mitarbeiter()],
      materialCredits: [verbrauch, gutschrift]
    })

    expect(sheets.map((sheet) => sheet.dateKey)).toEqual(['2026-10-14', '2026-10-15'])
    expect(sheets[0].materials).toEqual([])
    expect(sheets[1].materials[0]).toMatchObject({ name: 'Kleber', quantity: 2, lineTotal: 36 })
    expect(sheets[0].dayTotal).toBe(400)
  })

  it('setzt die Anfahrten des Tages mit der Kfz-Pauschale an', () => {
    const trips: SiteTrip[] = [
      { dateKey: '2026-10-14', startedAt: tag(14, 7, 30), employeeIds: ['m1'] },
      { dateKey: '2026-10-14', startedAt: tag(14, 9), employeeIds: ['m2'] }
    ]
    const [sheet] = buildRegieDaySheets({
      entries: [stempel()],
      employees: [mitarbeiter()],
      siteTrips: trips,
      siteTripRate: 12.5
    })
    expect(sheet.tripCount).toBe(2)
    expect(sheet.tripTotal).toBe(25)
    expect(sheet.dayTotal).toBe(425)
  })
})

describe('buildRegieZettelHtml', () => {
  it('druckt nur Stunden und Material, keine Anfahrten und keinen einzigen Preis', () => {
    const sheets = buildRegieDaySheets({
      entries: [
        stempel({
          notes: 'Fuge gezogen',
          materialUsages: [
            { materialTypeId: 'fuge', materialName: 'Fuge', unitLabel: 'kg', quantity: 4, unitPriceEur: 6 }
          ]
        })
      ],
      employees: [mitarbeiter()],
      siteTrips: [{ dateKey: '2026-10-14', startedAt: tag(14, 8), employeeIds: ['m1'] }],
      siteTripRate: 25
    })
    const html = buildRegieZettelHtml({
      sheets,
      projectName: 'Bad <script>',
      clientName: 'Familie Berger',
      address: 'Hauptstraße 1'
    })

    expect(html).toContain('Regiezettel')
    expect(html).toContain('Fliesen Reislöhner')
    expect(html).toContain('Bad &lt;script&gt;')
    expect(html).toContain('Familie Berger')
    expect(html).toContain('Hauptstraße 1')
    expect(html).toContain('Fuge gezogen')
    expect(html).toContain('8,00 h')
    expect(html).toContain('4 kg')
    // Der Kunde sieht Mengen, nie Preise oder Summen.
    expect(html).not.toContain('€')
    expect(html).not.toContain('VK')
    expect(html).not.toContain('Summe')
    expect(html).not.toContain('Anfahrt')
    expect(html).toContain('Kunde: Familie Berger')
    expect((html.match(/class="sheet"/g) || []).length).toBe(1)

    const text = html.toLowerCase()
    expect(text).not.toContain('marge')
    expect(text).not.toContain('einkauf')
    expect(text).not.toContain('lohnkosten')
    expect(text).not.toContain('kostensatz')
  })

  it('setzt die Kundenunterschrift auf das Blatt und verwirft fremde Adressen', () => {
    const sheets = buildRegieDaySheets({
      entries: [stempel()],
      employees: [mitarbeiter()]
    })
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const html = buildRegieZettelHtml({
      sheets,
      projectName: 'Bad Berger',
      clientName: 'Familie Berger',
      signatures: {
        [sheets[0].dateKey]: {
          dataUrl: png,
          signerName: 'Frau Berger',
          signedAtLabel: '16.10.2026, 15:00',
          outdated: true
        }
      }
    })
    expect(html).toContain(`src="${png}"`)
    expect(html).toContain('unterschrieben von Frau Berger')
    expect(html).toContain('Nach der Unterschrift wurden Buchungen ergänzt.')

    const ohne = buildRegieZettelHtml({
      sheets,
      projectName: 'Bad Berger',
      signatures: {
        [sheets[0].dateKey]: {
          dataUrl: 'javascript:alert(1)',
          signedAtLabel: 'jetzt'
        }
      }
    })
    expect(ohne).not.toContain('javascript:')
    expect(ohne).not.toContain('<img')
    expect(safeSignatureDataUrl('data:image/svg+xml,<script>')).toBeNull()
  })

  it('erkennt, wenn nach der Unterschrift weitere Buchungen dazukamen', () => {
    const [sheet] = buildRegieDaySheets({
      entries: [stempel()],
      employees: [mitarbeiter()]
    })
    expect(
      isRegieSignatureOutdated(sheet, { signedEntryIds: ['e1'], signedDayTotal: sheet.dayTotal })
    ).toBe(false)
    expect(
      isRegieSignatureOutdated(sheet, { signedEntryIds: ['e1', 'e2'], signedDayTotal: sheet.dayTotal })
    ).toBe(true)
    expect(
      isRegieSignatureOutdated(sheet, { signedEntryIds: ['e1'], signedDayTotal: sheet.dayTotal + 10 })
    ).toBe(true)
  })

  it('erzeugt für einen leeren Zeitraum kein Blatt', () => {
    expect(buildRegieDaySheets({ entries: [], employees: [] })).toEqual([])
    const html = buildRegieZettelHtml({ sheets: [], projectName: 'Leer' })
    expect(html).not.toContain('class="sheet"')
  })
})
