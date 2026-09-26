import type { OfferPosition, TimeEntry } from '../types'
import { getReturnTravelCreditMs } from './returnTravel'
import { roundedSpanMs } from './timeRounding'

/**
 * Einheiten, die der HERO-Import als Lohn/Arbeitszeit erkennt
 * (lib/hero/syncProjects.js, LABOR_UNIT_RE). Nur diese Mengen sind Stunden
 * und dürfen gegen die gestempelte Projektzeit laufen.
 */
const LABOR_HOUR_UNIT_RE = /^(std|std\.|stunde|stunden|h|hour|akh|aw)$/i

export function isLaborHourUnit(unit: string | undefined | null): boolean {
  return LABOR_HOUR_UNIT_RE.test((unit || '').trim())
}

/**
 * Summe der Arbeitsstunden aus dem Angebot. Material und Lohnpositionen in
 * anderen Einheiten (m², Tag, Pauschale) zählen nicht. Ohne solche Stunden
 * gibt es keinen Balken.
 */
export function quotedLaborHours(
  positions: OfferPosition[] | undefined | null
): number | null {
  if (!positions?.length) return null
  let sum = 0
  let found = false
  for (const position of positions) {
    if (position.kind !== 'labor' || !isLaborHourUnit(position.unit)) continue
    const quantity = Number(position.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    sum += quantity
    found = true
  }
  return found ? sum : null
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  const withToDate = value as { toDate?: () => Date; seconds?: number }
  if (typeof withToDate.toDate === 'function') return withToDate.toDate()
  if (typeof withToDate.seconds === 'number') return new Date(withToDate.seconds * 1000)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const parsed = new Date(value as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Gebuchte Projektstunden eines abgeschlossenen Stempelsatzes.
 * Dieselbe Basis wie die Nachkalkulation: 15-Minuten-Raster, Pause abgezogen,
 * Rückfahrt angerechnet. Aus dem Überstundenkonto aufgefüllte Minuten zählen
 * nicht – die wurden nicht auf dem Projekt gearbeitet. Laufende Stempelungen
 * und Urlaubstage auch nicht.
 */
export function bookedEntryHours(
  entry: Pick<
    TimeEntry,
    'clockInTime' | 'clockOutTime' | 'pauseTotalTime' | 'returnTravelCreditMs' | 'isVacationDay'
  >
): number {
  if (entry.isVacationDay || entry.clockOutTime == null) return 0
  const clockIn = toDate(entry.clockInTime)
  const clockOut = toDate(entry.clockOutTime)
  if (!clockIn || !clockOut) return 0
  const workMs =
    roundedSpanMs(clockIn, clockOut) - (entry.pauseTotalTime || 0) + getReturnTravelCreditMs(entry)
  return Math.max(0, workMs) / 3_600_000
}

export function sumBookedHours(
  entries: Array<
    Pick<
      TimeEntry,
      'clockInTime' | 'clockOutTime' | 'pauseTotalTime' | 'returnTravelCreditMs' | 'isVacationDay'
    >
  >
): number {
  return entries.reduce((sum, entry) => sum + bookedEntryHours(entry), 0)
}

export function bookedHoursByProject(
  entries: Array<
    Pick<
      TimeEntry,
      | 'projectId'
      | 'clockInTime'
      | 'clockOutTime'
      | 'pauseTotalTime'
      | 'returnTravelCreditMs'
      | 'isVacationDay'
    >
  >
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    const projectId = entry.projectId?.trim()
    if (!projectId) continue
    const hours = bookedEntryHours(entry)
    if (hours <= 0) continue
    totals.set(projectId, (totals.get(projectId) || 0) + hours)
  }
  return totals
}

export interface OfferHoursUsage {
  quotedHours: number
  bookedHours: number
  /** Anteil der Angebotsstunden, kann über 1 liegen. */
  ratio: number
  /** Gerundete Prozentzahl, kann über 100 liegen. */
  percent: number
}

export function offerHoursUsage(quotedHours: number, bookedHours: number): OfferHoursUsage {
  const safeQuoted = quotedHours > 0 ? quotedHours : 0
  const safeBooked = bookedHours > 0 ? bookedHours : 0
  const ratio = safeQuoted > 0 ? safeBooked / safeQuoted : 0
  return {
    quotedHours: safeQuoted,
    bookedHours: safeBooked,
    ratio,
    percent: Math.round(ratio * 100)
  }
}

export function formatOfferHours(hours: number): string {
  return hours.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}
