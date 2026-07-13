import type { LeaveRequest, TimeEntry } from '../../../../types'
import { formatDateForInputLocal } from '../../../../utils/dateUtils'
import { getReturnTravelCreditMs } from '../../../../utils/returnTravel'

// Reine Berechnungs- und Formatierungslogik der Berichte/Nachkalkulation.
// Bewusst ohne React-/Komponenten-Abhängigkeiten, damit sie testbar bleibt.

export type ReportType = 'employee' | 'project'
export type ReportEntrySource = 'time-entry' | 'leave-request'

export const VACATION_WORK_MINUTES = 8 * 60
export const VACATION_WORK_HOURS_LABEL = '8:00'

export interface ReportEntry {
  id: string
  originalEntry: TimeEntry
  source: ReportEntrySource
  date: string
  dateRaw: Date | null
  dateKey: string
  projectId: string
  projectName: string
  clockIn: string
  clockOut: string
  pauseMinutes: number
  pauseMs: number
  workHours: string
  notes: string
  originalNotes: string
  isEdited: boolean
  isReadOnly?: boolean
  holidayName?: string | null
}

export interface EmployeeSummary {
  employeeId: string
  employeeName: string
  totalHours: number
  hourlyRate: number
  totalCost: number
  /** Interner Kostensatz (EUR/Std) – Einkauf-Gegenstück; 0 wenn nicht hinterlegt */
  hourlyCostRate: number
  /** Personalkosten intern = Stunden × Kostensatz (nur wenn Kostensatz hinterlegt) */
  totalPurchaseCost: number
  /** true, wenn ein interner Kostensatz hinterlegt ist (fließt in Einkauf/Marge ein) */
  hasCostRate: boolean
}

export const convertToDate = (date: unknown): Date | null => {
  if (!date) return null
  const withToDate = date as { toDate?: () => Date; seconds?: number }
  if (withToDate?.toDate) return withToDate.toDate()
  if (withToDate?.seconds) return new Date(withToDate.seconds * 1000)
  if (date instanceof Date) return date
  const d = new Date(date as string | number)
  return isNaN(d.getTime()) ? null : d
}

export const formatDateForDisplay = (date: Date): string => {
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export const parseDateInputAsLocalDate = (value: string): Date | null => {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return isNaN(date.getTime()) ? null : date
}

export const getDateKey = (date: Date): string => formatDateForInputLocal(date)

export const isWeekendDate = (date: Date): boolean => {
  const day = date.getDay()
  return day === 0 || day === 6
}

export const getWeekStart = (date: Date): Date => {
  const start = new Date(date)
  start.setHours(12, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export const getWeekEnd = (date: Date): Date => {
  const end = getWeekStart(date)
  end.setDate(end.getDate() + 6)
  return end
}

export const enumerateDays = (start: Date, end: Date): Date[] => {
  const days: Date[] = []
  const current = new Date(start)
  current.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)
  while (current <= last) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export const isLeaveDateCancelled = (request: LeaveRequest, dateKey: string): boolean =>
  (request.cancelledDates || []).some((key) => String(key).slice(0, 10) === dateKey)

export const getApprovedVacationDates = (
  requests: LeaveRequest[],
  rangeStart: Date,
  rangeEnd: Date,
  occupiedTimeEntryDates: Set<string>
): Array<{ date: Date; request: LeaveRequest }> => {
  const vacationDates = new Map<string, { date: Date; request: LeaveRequest }>()
  const start = new Date(rangeStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(rangeEnd)
  end.setHours(23, 59, 59, 999)

  for (const request of requests) {
    if (request.status !== 'approved' || request.type !== 'vacation') continue
    const reqStart = convertToDate(request.startDate)
    const reqEnd = convertToDate(request.endDate)
    if (!reqStart || !reqEnd) continue

    const first = new Date(Math.max(
      new Date(reqStart.getFullYear(), reqStart.getMonth(), reqStart.getDate()).getTime(),
      start.getTime()
    ))
    const last = new Date(Math.min(
      new Date(reqEnd.getFullYear(), reqEnd.getMonth(), reqEnd.getDate()).getTime(),
      end.getTime()
    ))
    if (last < first) continue

    for (const date of enumerateDays(first, last)) {
      const dateKey = getDateKey(date)
      if (isWeekendDate(date)) continue
      if (occupiedTimeEntryDates.has(dateKey)) continue
      if (isLeaveDateCancelled(request, dateKey)) continue
      if (!vacationDates.has(dateKey)) {
        vacationDates.set(dateKey, { date, request })
      }
    }
  }

  return [...vacationDates.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

export const formatTimeForInput = (date: Date | null): string => {
  if (!date) return ''
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

// Dezimalstunden (z. B. 7.83) in „X Std Y Min" umwandeln.
export const formatHoursMinutes = (decimalHours: number): string => {
  if (!decimalHours || decimalHours <= 0) return '0 Std 0 Min'
  const totalMinutes = Math.round(decimalHours * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} Std ${minutes} Min`
}

export const calculateWorkHours = (
  clockIn: string,
  clockOut: string,
  pauseMinutes: number,
  extraMinutes = 0
): string => {
  if (!clockIn || !clockOut) return '-'
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return '-'
  // Brutto-Anwesenheit (Gehen - Kommen). Nur wenn DIESE negativ ist, lag die
  // Stempelung ueber Mitternacht -> 24h addieren. Die Pause erst DANACH
  // abziehen, sonst wuerde eine Pause > Arbeitszeit faelschlich als
  // Nachtschicht interpretiert (z. B. 10 Min - 30 Min Pause -> 23:40).
  let grossMinutes = (outH * 60 + outM) - (inH * 60 + inM)
  if (grossMinutes < 0) grossMinutes += 24 * 60
  let totalMinutes = grossMinutes - pauseMinutes + extraMinutes
  // Negative Arbeitszeit (Pause laenger als Anwesenheit) als 0:00 zeigen.
  if (totalMinutes < 0) totalMinutes = 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

export const msToMinutes = (ms: number): number => Math.round(ms / (1000 * 60))

/** Beim Ausstempeln gutgeschriebene Fahrtzeit laut Entfernungs-Staffel (in Minuten). */
export const entryCreditMinutes = (entry: TimeEntry): number =>
  msToMinutes(getReturnTravelCreditMs(entry))

export const workMinutesFromParts = (clockIn: string, clockOut: string, pauseMinutes: number): number => {
  if (!clockIn || !clockOut) return 0
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0
  // Mitternachts-Erkennung auf Basis der Brutto-Anwesenheit, NICHT nach
  // Pausenabzug (sonst wird Pause > Arbeitszeit als Nachtschicht missgedeutet).
  let grossMinutes = outH * 60 + outM - (inH * 60 + inM)
  if (grossMinutes < 0) grossMinutes += 24 * 60
  return Math.max(0, grossMinutes - pauseMinutes)
}

export const minutesToHoursLabel = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

export const workMinutesFromOriginalEntry = (entry: TimeEntry): number => {
  if (entry.isVacationDay) return VACATION_WORK_MINUTES
  const clockInDate = convertToDate(entry.clockInTime)
  const clockOutDate = convertToDate(entry.clockOutTime)
  const cin = formatTimeForInput(clockInDate)
  const cout = formatTimeForInput(clockOutDate)
  const pauseMinutes = msToMinutes(entry.pauseTotalTime || 0)
  return workMinutesFromParts(cin, cout, pauseMinutes) + entryCreditMinutes(entry)
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

export const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const formatNotesForPrintHtml = (notes: string): string => {
  if (!notes.trim()) return '—'
  return escapeHtml(notes).replace(/\n/g, '<br />')
}

export const workMinutesFromReportEntry = (entry: ReportEntry): number => {
  if (entry.workHours && entry.workHours !== '-') {
    const [h, m] = entry.workHours.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m
  }
  return 0
}
