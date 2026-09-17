/**
 * „Tag mit Überstunden auffüllen" – der Rechenkern.
 *
 * Wer unter der Woche vor der Regelarbeitszeit ausstempelt (Mo–Do 8 Std,
 * Fr 6 Std), darf den Rest des Tages aus seinem Überstundenkonto auffüllen.
 * Die aufgefüllten Minuten werden dem Konto entnommen und zählen danach wie
 * geleistete Arbeitszeit – es wird also nichts geschenkt, sondern umgebucht.
 *
 * Bewusst ohne Firebase- und React-Abhängigkeiten, damit die Regel isoliert
 * testbar bleibt.
 */

import {
  DEFAULT_REGULAR_WORK_TIME,
  regularMinutesForDateKey,
  type RegularWorkTimeConfig
} from './regularWorkTime'

export interface DayFillInput {
  /** Kalendertag als "YYYY-MM-DD". */
  dateKey: string
  /** Am Tag bereits erfasste Arbeitszeit inkl. früherer Auffüllungen. */
  workedMinutes: number
  /** Aktueller Stand des Überstundenkontos in Minuten. */
  balanceMinutes: number
  config?: RegularWorkTimeConfig
}

export interface DayFillPlan {
  /** Regelarbeitszeit des Tages (0 an Wochenenden – dann gibt es nichts aufzufüllen). */
  regularMinutes: number
  /**
   * Stand des Überstundenkontos, mit dem gerechnet wurde. Gehört in den Plan,
   * damit die Rückfrage im Browser nicht einen älteren Kontostand anzeigt als
   * den, gegen den gerechnet wurde.
   */
  balanceMinutes: number
  /** Am Tag bereits erfasste Arbeitszeit. */
  workedMinutes: number
  /** Was bis zur Regelarbeitszeit fehlt. */
  missingMinutes: number
  /** Was das Überstundenkonto davon trägt – genau das wird gebucht. */
  fillMinutes: number
  /**
   * true, wenn das Konto die fehlende Zeit nicht voll deckt. Der Tag wird dann
   * nur so weit aufgefüllt, wie Überstunden da sind.
   */
  isPartial: boolean
}

/**
 * Was für einen Tag aufgefüllt werden kann.
 *
 * Nie mehr als bis zur Regelarbeitszeit und nie mehr, als auf dem Konto liegt.
 * An Tagen ohne Regelarbeitszeit (Wochenende) sowie bei leerem Konto kommt
 * `fillMinutes: 0` heraus – der Knopf bleibt dann aus.
 */
export const planDayFill = ({
  dateKey,
  workedMinutes,
  balanceMinutes,
  config = DEFAULT_REGULAR_WORK_TIME
}: DayFillInput): DayFillPlan => {
  const regularMinutes = regularMinutesForDateKey(dateKey, config)
  const worked = Math.max(0, Math.round(Number(workedMinutes) || 0))
  const balance = Math.max(0, Math.round(Number(balanceMinutes) || 0))
  const missingMinutes = Math.max(0, regularMinutes - worked)
  const fillMinutes = Math.min(missingMinutes, balance)

  return {
    regularMinutes,
    balanceMinutes: balance,
    workedMinutes: worked,
    missingMinutes,
    fillMinutes,
    isPartial: fillMinutes > 0 && fillMinutes < missingMinutes
  }
}

/**
 * Darf der Mitarbeiter den Tag auffüllen?
 *
 * Nur im ausgestempelten Zustand: solange er eingestempelt ist, wächst die
 * Tageszeit noch und eine Auffüllung wäre sofort wieder falsch.
 */
export const canOfferDayFill = (
  plan: DayFillPlan,
  options: { isClockedIn: boolean; hasCompletedEntry: boolean }
): boolean => {
  if (options.isClockedIn) return false
  if (!options.hasCompletedEntry) return false
  return plan.fillMinutes > 0
}
