// Gesetzliche Arbeitszeit-Regeln und Überstunden-Verteilung für den
// Zeiterfassungsbericht.
//
// WICHTIG: Alles hier ist reine Anzeige-Logik. Die Ergebnisse fließen in die
// Bildschirm-Tabelle, die Summen und den Ausdruck — niemals in die
// gespeicherten Stempelsätze. Die einzige bewusst gespeicherte Größe ist der
// vom Admin eingegebene Auszahlungsbetrag (siehe `allocateOvertimePayout`),
// der beim Speichern der Abrechnung vom Überstundenkonto abgezogen wird.
//
// Bewusst ohne React-/Firestore-Abhängigkeiten, damit die Regeln testbar sind.

/** Ab dieser Anwesenheit (inkl. Fahrtzeit-Gutschrift) sind 30 Min Pause fällig. */
export const BREAK_TIER_1_FROM_MINUTES = 6 * 60
export const BREAK_TIER_1_MINUTES = 30
/** Ab dieser Anwesenheit sind 45 Min Pause fällig. */
export const BREAK_TIER_2_FROM_MINUTES = 9 * 60
export const BREAK_TIER_2_MINUTES = 45
/** Höchstarbeitszeit je Kalendertag, netto (nach Pausenabzug). */
export const MAX_DAILY_WORK_MINUTES = 10 * 60
/** Raster, in dem Überstunden auf die Tage verteilt werden. */
export const PAYOUT_STEP_MINUTES = 15

export type WorkTimeAdjustment =
  /** Pause auf das gesetzliche Minimum angehoben */
  | 'break'
  /** auf 10 Std Tageshöchstarbeitszeit gedeckelt */
  | 'max-hours'
  /** auf die Regelarbeitszeit gedeckelt (Rest bleibt im Überstundenkonto) */
  | 'regular-cap'
  /** ausbezahlte Überstunden wieder aufgeschlagen */
  | 'overtime-payout'

export interface WorkTimeRowInput {
  id: string
  dateKey: string
  /** Position innerhalb des Tages (chronologisch aufsteigend) */
  order: number
  /** "HH:MM" – leer, wenn noch eingestempelt */
  clockIn: string
  clockOut: string
  /** gestempelte bzw. vom Admin gesetzte Pause */
  pauseMinutes: number
  /** Fahrtzeit-Gutschrift, zählt als Arbeitszeit */
  creditMinutes: number
  /** Urlaub o. Ä.: unverändert durchreichen */
  isFixed: boolean
}

export interface WorkTimeRowResult {
  id: string
  /** im Bericht ausgewiesene Pause */
  pauseMinutes: number
  /** im Bericht ausgewiesene Gehen-Zeit (verschiebt sich nur bei Deckelung/Auszahlung) */
  clockOut: string
  /** im Bericht ausgewiesene Arbeitszeit in Minuten */
  workMinutes: number
  adjustments: WorkTimeAdjustment[]
}

export interface WorkTimeDaySummary {
  dateKey: string
  /** Arbeitszeit exakt so, wie gestempelt */
  stampedWorkMinutes: number
  /** nach Pausen- und 10-Std-Regel — das ist die „echte" Zeit des Mitarbeiters */
  legalWorkMinutes: number
  /** was im Bericht/Ausdruck steht */
  shownWorkMinutes: number
  /** Anteil über der Regelarbeitszeit (Basis für eine Auszahlung) */
  overtimeMinutes: number
  /** in diesem Lauf zugeteilte Auszahlung */
  payoutMinutes: number
  /** freie Minuten bis zur 10-Std-Grenze über die Ist-Zeit hinaus */
  extraHeadroomMinutes: number
}

export interface WorkTimeOptions {
  /**
   * Regelarbeitszeit pro Tag. `null` = keine Deckelung, es gilt nur die
   * gesetzliche Pausen-/10-Std-Korrektur.
   */
  regularDayMinutes?: number | null
  /** Je Tag auszuzahlende Überstunden (aus `allocateOvertimePayout`). */
  payoutByDate?: Map<string, number>
}

export interface WorkTimeResult {
  rows: Map<string, WorkTimeRowResult>
  days: WorkTimeDaySummary[]
}

/** Pausenanspruch aus der Anwesenheit (Gehen − Kommen, inkl. Gutschrift). */
export const requiredBreakMinutes = (attendanceMinutes: number): number => {
  if (attendanceMinutes >= BREAK_TIER_2_FROM_MINUTES) return BREAK_TIER_2_MINUTES
  if (attendanceMinutes >= BREAK_TIER_1_FROM_MINUTES) return BREAK_TIER_1_MINUTES
  return 0
}

/**
 * Kleinste Pause, die zu einer gewünschten Netto-Arbeitszeit passt. Umkehrung
 * von `requiredBreakMinutes`, denn die Anwesenheit ergibt sich erst aus
 * Zielzeit + Pause: wer 8:30 arbeiten soll, ist mit 45 Min Pause 9:15
 * anwesend — und braucht damit genau diese 45 Min.
 *
 * Bewusst der *kleinste* passende Wert: es wird keine Pause erfunden, die die
 * Anwesenheit selbst gar nicht verlangt.
 */
export const breakMinutesForNetTarget = (netMinutes: number): number => {
  if (netMinutes < BREAK_TIER_1_FROM_MINUTES) return 0
  if (netMinutes + BREAK_TIER_1_MINUTES < BREAK_TIER_2_FROM_MINUTES) return BREAK_TIER_1_MINUTES
  return BREAK_TIER_2_MINUTES
}

/**
 * Hebt eine Pause so weit an, bis die ausgewiesene Anwesenheit (Zielzeit +
 * Pause) sie auch wirklich trägt. Nötig, weil eine bereits gestempelte Pause
 * die Anwesenheit über die nächste Stufe schieben kann: 8:20 Zielzeit mit 40
 * Min gestempelter Pause ergibt 9:00 Anwesenheit — und damit 45 Min Anspruch.
 */
const settleBreakForNetTarget = (netMinutes: number, minimumPause: number): number => {
  let pause = Math.max(minimumPause, breakMinutesForNetTarget(netMinutes))
  // Höchstens zwei Durchläufe (30 → 45), die Staffel hat nur zwei Stufen.
  while (requiredBreakMinutes(netMinutes + pause) > pause) {
    pause = requiredBreakMinutes(netMinutes + pause)
  }
  return pause
}

/** Brutto-Anwesenheit zweier "HH:MM"-Zeiten, Mitternachtsübergang inklusive. */
export const grossMinutesFromParts = (clockIn: string, clockOut: string): number => {
  if (!clockIn || !clockOut) return 0
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  if (!Number.isFinite(inH) || !Number.isFinite(inM)) return 0
  if (!Number.isFinite(outH) || !Number.isFinite(outM)) return 0
  let gross = outH * 60 + outM - (inH * 60 + inM)
  if (gross < 0) gross += 24 * 60
  return gross
}

/** "HH:MM" + Minuten → "HH:MM" (Tagesüberlauf wird umgebrochen). */
export const addMinutesToClock = (clock: string, minutes: number): string => {
  const [h, m] = clock.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return clock
  const total = (((h * 60 + m + Math.round(minutes)) % 1440) + 1440) % 1440
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
}

interface DayRow {
  input: WorkTimeRowInput
  /** Anwesenheit inkl. Fahrtzeit-Gutschrift */
  attendance: number
  /** Netto-Arbeitszeit wie gestempelt */
  net: number
}

/**
 * Wendet die gesetzlichen Regeln (und optional Regelarbeitszeit-Deckelung samt
 * Überstunden-Auszahlung) auf die Berichtszeilen an. Gerechnet wird immer pro
 * Kalendertag, weil Pausenanspruch und Höchstarbeitszeit dem Tag gelten und
 * nicht dem einzelnen Stempelsatz — ein Mitarbeiter kann an einem Tag mehrere
 * Projekte bebucht haben.
 */
export function applyWorkTimeRules(
  rows: WorkTimeRowInput[],
  options: WorkTimeOptions = {}
): WorkTimeResult {
  const { regularDayMinutes = null, payoutByDate } = options

  const results = new Map<string, WorkTimeRowResult>()
  const days: WorkTimeDaySummary[] = []

  const byDate = new Map<string, WorkTimeRowInput[]>()
  for (const row of rows) {
    // Unveränderliche und noch offene Zeilen bleiben, wie sie sind.
    if (row.isFixed || !row.clockIn || !row.clockOut) {
      results.set(row.id, {
        id: row.id,
        pauseMinutes: row.pauseMinutes,
        clockOut: row.clockOut,
        workMinutes: Math.max(
          0,
          grossMinutesFromParts(row.clockIn, row.clockOut) + row.creditMinutes - row.pauseMinutes
        ),
        adjustments: []
      })
      continue
    }
    const list = byDate.get(row.dateKey) || []
    list.push(row)
    byDate.set(row.dateKey, list)
  }

  for (const [dateKey, dayInputs] of byDate) {
    const dayRows: DayRow[] = dayInputs
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((input) => {
        const attendance = grossMinutesFromParts(input.clockIn, input.clockOut) + input.creditMinutes
        return { input, attendance, net: Math.max(0, attendance - input.pauseMinutes) }
      })

    const dayAttendance = dayRows.reduce((sum, r) => sum + r.attendance, 0)
    const stampedPause = dayRows.reduce((sum, r) => sum + r.input.pauseMinutes, 0)
    const stampedNet = dayRows.reduce((sum, r) => sum + r.net, 0)

    // ── Schritt 1: gesetzliche Pause + 10-Std-Grenze ──
    const legalPause = Math.max(stampedPause, requiredBreakMinutes(dayAttendance))
    const netAfterBreak = Math.max(0, dayAttendance - legalPause)
    const legalNet = Math.min(netAfterBreak, MAX_DAILY_WORK_MINUTES)
    const maxHoursCut = netAfterBreak - legalNet

    // ── Schritt 2: Regelarbeitszeit-Deckelung + ausbezahlte Überstunden ──
    const cappedNet = regularDayMinutes !== null ? Math.min(legalNet, regularDayMinutes) : legalNet
    const regularCut = legalNet - cappedNet
    const payout = Math.max(0, payoutByDate?.get(dateKey) || 0)
    const targetNet = Math.min(MAX_DAILY_WORK_MINUTES, cappedNet + payout)
    const appliedPayout = targetNet - cappedNet

    // ── Schritt 3: Pause zur ausgewiesenen Zielzeit bestimmen ──
    // Nie weniger als der Anspruch aus der tatsächlichen Anwesenheit (die hat
    // der Mitarbeiter erworben) und nie weniger, als die ausgewiesene
    // Anwesenheit selbst verlangt — sonst wäre der Ausdruck widersprüchlich.
    const shownPause = settleBreakForNetTarget(targetNet, legalPause)
    const pauseShortfall = shownPause - stampedPause

    // ── Schritt 4: auf die Zeilen des Tages verteilen ──
    const shownNet = dayRows.map((r) => r.net)
    let diff = targetNet - stampedNet
    if (diff < 0) {
      // Kürzung von hinten: der Arbeitstag endet früher.
      for (let i = shownNet.length - 1; i >= 0 && diff < 0; i--) {
        const take = Math.min(shownNet[i], -diff)
        shownNet[i] -= take
        diff += take
      }
    } else if (diff > 0) {
      // Aufschlag ans Tagesende, dort fallen Überstunden real an.
      shownNet[shownNet.length - 1] += diff
      diff = 0
    }

    // Die fehlende Pause trägt die längste Zeile — dort lag die Pause real.
    let longestIndex = 0
    for (let i = 1; i < shownNet.length; i++) {
      if (shownNet[i] > shownNet[longestIndex]) longestIndex = i
    }

    dayRows.forEach((row, index) => {
      const pauseMinutes = row.input.pauseMinutes + (index === longestIndex ? pauseShortfall : 0)
      const workMinutes = shownNet[index]
      // Anwesenheit = Arbeitszeit + Pause − Gutschrift; ohne Änderung an der
      // Netto-Zeit ergibt das exakt die gestempelte Gehen-Zeit zurück.
      const clockOut = addMinutesToClock(
        row.input.clockIn,
        workMinutes + pauseMinutes - row.input.creditMinutes
      )
      // „Berührt" statt „Netto verändert": Pausenabzug und Auszahlung können
      // sich in der Netto-Zeit exakt aufheben, obwohl die Zeile im Bericht
      // sichtbar anders dasteht.
      const touched =
        workMinutes !== row.net ||
        pauseMinutes !== row.input.pauseMinutes ||
        clockOut !== row.input.clockOut

      const adjustments: WorkTimeAdjustment[] = []
      if (pauseMinutes !== row.input.pauseMinutes) adjustments.push('break')
      if (touched && maxHoursCut > 0) adjustments.push('max-hours')
      // Nur melden, was am Ende auch sichtbar ist: hebt die Auszahlung den Tag
      // wieder auf die volle Ist-Zeit, wurde faktisch nichts gedeckelt.
      if (touched && regularCut > 0 && targetNet < legalNet) adjustments.push('regular-cap')
      if (touched && appliedPayout > 0) adjustments.push('overtime-payout')

      results.set(row.input.id, { id: row.input.id, pauseMinutes, clockOut, workMinutes, adjustments })
    })

    days.push({
      dateKey,
      stampedWorkMinutes: stampedNet,
      legalWorkMinutes: legalNet,
      shownWorkMinutes: targetNet,
      overtimeMinutes: regularDayMinutes !== null ? Math.max(0, legalNet - regularDayMinutes) : 0,
      payoutMinutes: appliedPayout,
      extraHeadroomMinutes: Math.max(0, MAX_DAILY_WORK_MINUTES - legalNet)
    })
  }

  days.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return { rows: results, days }
}

export interface OvertimeAllocation {
  byDate: Map<string, number>
  /** tatsächlich verteilte Minuten */
  allocatedMinutes: number
  /** davon über die tatsächlich gestempelte Zeit hinaus (Stufe 2) */
  beyondActualMinutes: number
  /** angefordert, aber nicht unterzubringen */
  unallocatedMinutes: number
}

const floorToStep = (minutes: number): number =>
  Math.floor(minutes / PAYOUT_STEP_MINUTES) * PAYOUT_STEP_MINUTES

/**
 * Verteilt auszuzahlende Überstunden auf die Tage des Zeitraums.
 *
 * Stufe 1 füllt die Tage auf, an denen tatsächlich über die Regelarbeitszeit
 * hinaus gearbeitet wurde — größter Überhang zuerst. Reicht das nicht, füllt
 * Stufe 2 die übrigen Tage bis zur gesetzlichen 10-Std-Grenze auf; das geht
 * dann über die gestempelte Zeit hinaus und wird im Bericht als solches
 * ausgewiesen.
 */
export function allocateOvertimePayout(
  days: WorkTimeDaySummary[],
  requestedMinutes: number
): OvertimeAllocation {
  const byDate = new Map<string, number>()
  let remaining = Math.max(0, Math.round(requestedMinutes))
  let beyondActual = 0

  const take = (dateKey: string, capacity: number): number => {
    if (remaining <= 0 || capacity <= 0) return 0
    // Volle Zuteilungen aufs Viertelstunden-Raster runden, damit der Ausdruck
    // saubere Zeiten zeigt. Der letzte Rest darf krumm bleiben — er entspricht
    // exakt dem, was der Admin eingegeben hat.
    const usable = remaining <= capacity ? remaining : Math.max(floorToStep(capacity), 0)
    const amount = Math.min(remaining, usable)
    if (amount <= 0) return 0
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + amount)
    remaining -= amount
    return amount
  }

  const stage1 = days
    .filter((d) => d.overtimeMinutes > 0)
    .sort((a, b) => b.overtimeMinutes - a.overtimeMinutes || a.dateKey.localeCompare(b.dateKey))
  for (const day of stage1) take(day.dateKey, day.overtimeMinutes)

  if (remaining > 0) {
    const stage2 = days
      .filter((d) => d.extraHeadroomMinutes > 0)
      .sort(
        (a, b) => b.extraHeadroomMinutes - a.extraHeadroomMinutes || a.dateKey.localeCompare(b.dateKey)
      )
    for (const day of stage2) beyondActual += take(day.dateKey, day.extraHeadroomMinutes)
  }

  const allocated = [...byDate.values()].reduce((sum, v) => sum + v, 0)
  return {
    byDate,
    allocatedMinutes: allocated,
    beyondActualMinutes: beyondActual,
    unallocatedMinutes: remaining
  }
}

/** "8:30", "8,5" oder "510" (Minuten-frei) → Minuten. Ungültig → null. */
export const parseHoursMinutesInput = (value: string): number | null => {
  const trimmed = (value || '').trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':')
    const hours = Number(h)
    const minutes = Number(m)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    if (hours < 0 || minutes < 0 || minutes > 59) return null
    return Math.round(hours * 60 + minutes)
  }
  const decimal = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(decimal) || decimal < 0) return null
  return Math.round(decimal * 60)
}
