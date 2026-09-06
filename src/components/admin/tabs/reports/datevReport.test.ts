import { describe, it, expect } from 'vitest'
import { buildDatevRows, datevTotalMinutes } from './datevReport'
import type { AdjustedReportEntry } from './reportUtils'

const zeile = (
  tag: number,
  overrides: Partial<AdjustedReportEntry> = {}
): AdjustedReportEntry =>
  ({
    id: `e${tag}-${overrides.clockIn || 'x'}`,
    originalEntry: {} as any,
    source: 'time-entry',
    date: `${tag}.07.2026`,
    dateRaw: new Date(2026, 6, tag),
    dateKey: `2026-07-${String(tag).padStart(2, '0')}`,
    projectId: 'p1',
    projectName: 'Projekt A',
    clockIn: '07:00',
    clockOut: '16:00',
    pauseMinutes: 30,
    pauseMs: 0,
    workHours: '8:30',
    notes: '',
    originalNotes: '',
    isEdited: false,
    effectivePauseMinutes: 30,
    effectiveClockOut: '16:00',
    effectiveWorkMinutes: 8 * 60 + 30,
    effectiveWorkHours: '8:30',
    workTimeAdjustments: [],
    ...overrides
  }) as AdjustedReportEntry

describe('buildDatevRows', () => {
  it('liefert eine Zeile je Kalendertag – auch für Tage ohne Buchung', () => {
    const rows = buildDatevRows([zeile(3)], '2026-07-01', '2026-07-31')
    expect(rows).toHaveLength(31)
    expect(rows[0].day).toBe(1)
    expect(rows[30].day).toBe(31)
    // Leerer Tag bleibt leer, damit das Formular durchläuft wie die Vorlage
    expect(rows[0]).toMatchObject({ begin: '', end: '', workMinutes: 0, key: '' })
  })

  it('übernimmt Beginn, Pause, Ende und Dauer eines Arbeitstags', () => {
    const rows = buildDatevRows([zeile(3)], '2026-07-01', '2026-07-31')
    expect(rows[2]).toMatchObject({
      day: 3,
      begin: '07:00',
      end: '16:00',
      pauseMinutes: 30,
      workMinutes: 8 * 60 + 30,
      key: ''
    })
  })

  it('fasst mehrere Stempelungen eines Tages zu einer Zeile zusammen', () => {
    // Projektwechsel: die Vorlage hat nur eine Zeile je Tag, also frühestes
    // Kommen, spätestes Gehen, Pausen und Dauern aufaddiert.
    const rows = buildDatevRows(
      [
        zeile(6, {
          clockIn: '07:00',
          effectiveClockOut: '11:00',
          effectivePauseMinutes: 0,
          effectiveWorkMinutes: 4 * 60
        }),
        zeile(6, {
          clockIn: '11:30',
          effectiveClockOut: '16:30',
          effectivePauseMinutes: 30,
          effectiveWorkMinutes: 4 * 60 + 30
        })
      ],
      '2026-07-06',
      '2026-07-06'
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      begin: '07:00',
      end: '16:30',
      pauseMinutes: 30,
      workMinutes: 8 * 60 + 30
    })
  })

  it('setzt die Kürzel der Vorlage für Abwesenheiten', () => {
    const rows = buildDatevRows(
      [
        zeile(1, { absenceKind: 'vacation', effectiveWorkMinutes: 8 * 60 }),
        zeile(2, { absenceKind: 'sick', effectiveWorkMinutes: 8 * 60 }),
        zeile(3, { absenceKind: 'holiday', effectiveWorkMinutes: 8 * 60 })
      ],
      '2026-07-01',
      '2026-07-03'
    )
    expect(rows.map((r) => r.key)).toEqual(['U', 'K', 'F'])
    expect(rows.map((r) => r.remark)).toEqual(['Urlaub', 'Krank', 'Feiertag'])
  })

  it('weist Urlaub nur mit Kürzel aus – ohne Stunden, Kommen und Gehen', () => {
    // Urlaub wird im Baulohn über die Urlaubskasse abgerechnet und ist im
    // Bruttolohn nicht enthalten. Stünde er hier mit Stunden, wiese das Blatt
    // mehr aus, als die Abrechnung darunter vergütet.
    const rows = buildDatevRows(
      [zeile(1, { absenceKind: 'vacation', effectiveWorkMinutes: 8 * 60 })],
      '2026-07-01',
      '2026-07-01'
    )
    expect(rows[0]).toMatchObject({
      begin: '',
      end: '',
      pauseMinutes: 0,
      workMinutes: 0,
      key: 'U',
      remark: 'Urlaub'
    })
    expect(datevTotalMinutes(rows)).toBe(0)
  })

  it('übernimmt am Freitag die kürzere Regelarbeitszeit', () => {
    // 03.07.2026 ist ein Freitag: 6 Std statt 8. Die Minuten kommen aus dem
    // Bericht, die Vorlage rechnet sie nicht selbst aus.
    const rows = buildDatevRows(
      [zeile(3, { absenceKind: 'sick', effectiveWorkMinutes: 6 * 60 })],
      '2026-07-03',
      '2026-07-03'
    )
    expect(rows[0]).toMatchObject({ workMinutes: 6 * 60, key: 'K' })
  })

  it('zählt auch Krank, Feiertag und Berufsschule mit ihren Stunden', () => {
    const rows = buildDatevRows(
      [
        zeile(1, { absenceKind: 'sick', effectiveWorkMinutes: 8 * 60 }),
        zeile(2, { absenceKind: 'holiday', effectiveWorkMinutes: 8 * 60 }),
        zeile(3, { absenceKind: 'school', effectiveWorkMinutes: 6 * 60 })
      ],
      '2026-07-01',
      '2026-07-03'
    )
    expect(rows.map((r) => r.workMinutes)).toEqual([8 * 60, 8 * 60, 6 * 60])
    expect(datevTotalMinutes(rows)).toBe(22 * 60)
  })

  it('nimmt bezahlte Abwesenheits- und Arbeitsstunden in die Summe, Urlaub nicht', () => {
    const rows = buildDatevRows(
      [
        zeile(1),
        zeile(2),
        zeile(3, { absenceKind: 'sick', effectiveWorkMinutes: 8 * 60 }),
        zeile(4, { absenceKind: 'vacation', effectiveWorkMinutes: 8 * 60 })
      ],
      '2026-07-01',
      '2026-07-04'
    )
    expect(datevTotalMinutes(rows)).toBe(2 * (8 * 60 + 30) + 8 * 60)
  })

  it('zählt an einem Tag mit Stempelung nicht zusätzlich die Urlaubsstunden', () => {
    // Sonst stünden auf einem Tag die gestempelten Stunden plus 8 Std Urlaub.
    const rows = buildDatevRows(
      [
        zeile(1),
        zeile(1, { absenceKind: 'vacation', effectiveWorkMinutes: 8 * 60 })
      ],
      '2026-07-01',
      '2026-07-01'
    )
    expect(rows[0]).toMatchObject({ workMinutes: 8 * 60 + 30, key: 'U' })
  })

  it('nennt kein Projekt – die Vorlage hat dafür keine Spalte', () => {
    const rows = buildDatevRows([zeile(3)], '2026-07-03', '2026-07-03')
    expect(JSON.stringify(rows)).not.toContain('Projekt A')
  })

  it('summiert die Dauer über den Zeitraum', () => {
    const rows = buildDatevRows([zeile(3), zeile(4)], '2026-07-01', '2026-07-31')
    expect(datevTotalMinutes(rows)).toBe(2 * (8 * 60 + 30))
  })

  it('gibt bei unsinnigem Zeitraum nichts zurück', () => {
    expect(buildDatevRows([], '2026-07-31', '2026-07-01')).toEqual([])
    expect(buildDatevRows([], '', '')).toEqual([])
  })
})
