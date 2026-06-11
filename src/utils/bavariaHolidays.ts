import { formatDateForInputLocal } from './dateUtils'

export interface BavariaHoliday {
  dateKey: string
  name: string
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const easterSunday = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

export const getBavariaHolidaysForYear = (year: number): BavariaHoliday[] => {
  const easter = easterSunday(year)
  const fixed = [
    { month: 0, day: 1, name: 'Neujahr' },
    { month: 0, day: 6, name: 'Heilige Drei Koenige' },
    { month: 4, day: 1, name: 'Tag der Arbeit' },
    { month: 7, day: 8, name: 'Augsburger Friedensfest (nur Augsburg)' },
    { month: 7, day: 15, name: 'Mariae Himmelfahrt (regional)' },
    { month: 9, day: 3, name: 'Tag der Deutschen Einheit' },
    { month: 10, day: 1, name: 'Allerheiligen' },
    { month: 11, day: 25, name: '1. Weihnachtsfeiertag' },
    { month: 11, day: 26, name: '2. Weihnachtsfeiertag' }
  ]

  const movable = [
    { date: addDays(easter, -2), name: 'Karfreitag' },
    { date: addDays(easter, 1), name: 'Ostermontag' },
    { date: addDays(easter, 39), name: 'Christi Himmelfahrt' },
    { date: addDays(easter, 50), name: 'Pfingstmontag' },
    { date: addDays(easter, 60), name: 'Fronleichnam' }
  ]

  return [
    ...fixed.map(({ month, day, name }) => ({
      dateKey: formatDateForInputLocal(new Date(year, month, day)),
      name
    })),
    ...movable.map(({ date, name }) => ({
      dateKey: formatDateForInputLocal(date),
      name
    }))
  ].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export const getBavariaHolidayName = (date: Date): string | null => {
  const key = formatDateForInputLocal(date)
  return getBavariaHolidaysForYear(date.getFullYear()).find((holiday) => holiday.dateKey === key)?.name || null
}
