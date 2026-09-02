import { describe, it, expect } from 'vitest'
import {
  calculateWorkHours,
  workMinutesFromParts,
  minutesToHoursLabel,
  formatHoursMinutes,
  escapeHtml,
  getWeekStart,
  getWeekEnd,
  enumerateDays,
  convertToDate,
  buildDateFromTimeInput,
  getReportRowChanges,
  buildAdjustedReport,
  employeeBillingRate,
  isReportSelectableEmployee,
  employeeHourlyMargin,
  employeeLaborCostRate,
  planSettlementTarget,
  parseMealAllowanceInput,
  DEFAULT_MEAL_ALLOWANCE_EUR,
  type AbsenceKind,
  type ReportEntry
} from './reportUtils'
import type { Employee } from '../../../../types'
import { roundTimeToStep } from '../../../../utils/timeRounding'
import type { TimeEntry } from '../../../../types'

describe('convertToDate – liest alle clockInTime-Formate', () => {
  // Regression: Die Zeitraumfilterung der Berichte läuft clientseitig über
  // convertToDate. Sie MUSS auch Alt-/Sonderformate lesen (Firestore-Timestamp
  // als toDate(), einfaches {seconds}-Objekt, ISO-String, Date), sonst fallen
  // Stempelungen aus Mitarbeiter-/Projektberichten heraus.
  const target = new Date(2026, 5, 15, 8, 30)

  it('liest ein Date direkt', () => {
    expect(convertToDate(target)?.getTime()).toBe(target.getTime())
  })

  it('liest ein Timestamp-artiges Objekt mit toDate()', () => {
    const tsLike = { toDate: () => target }
    expect(convertToDate(tsLike)?.getTime()).toBe(target.getTime())
  })

  it('liest ein einfaches {seconds}-Objekt (Alt-/Sonderdaten)', () => {
    const seconds = Math.floor(target.getTime() / 1000)
    const secondsObj = { seconds, nanoseconds: 0 }
    expect(convertToDate(secondsObj)?.getTime()).toBe(seconds * 1000)
  })

  it('liest einen ISO-String', () => {
    expect(convertToDate('2026-06-15T08:30:00')?.getFullYear()).toBe(2026)
  })

  it('gibt null bei fehlendem/ungültigem Wert', () => {
    expect(convertToDate(null)).toBeNull()
    expect(convertToDate(undefined)).toBeNull()
    expect(convertToDate('kein-datum')).toBeNull()
  })
})

describe('calculateWorkHours', () => {
  it('berechnet normale Arbeitszeit mit Pause', () => {
    expect(calculateWorkHours('08:00', '16:30', 30)).toBe('8:00')
  })

  it('erkennt Stempelung über Mitternacht', () => {
    expect(calculateWorkHours('22:00', '02:00', 0)).toBe('4:00')
  })

  it('interpretiert Pause > Anwesenheit NICHT als Nachtschicht', () => {
    // 10 Min Anwesenheit, 30 Min Pause → 0:00 (nicht 23:40)
    expect(calculateWorkHours('08:00', '08:10', 30)).toBe('0:00')
  })

  it('liefert - bei fehlenden Zeiten', () => {
    expect(calculateWorkHours('', '16:00', 0)).toBe('-')
    expect(calculateWorkHours('08:00', '', 0)).toBe('-')
  })
})

describe('workMinutesFromParts', () => {
  it('berechnet Minuten inkl. Mitternachts-Erkennung', () => {
    expect(workMinutesFromParts('08:00', '16:00', 60)).toBe(7 * 60)
    expect(workMinutesFromParts('23:00', '01:00', 0)).toBe(120)
    expect(workMinutesFromParts('08:00', '08:10', 30)).toBe(0)
  })
})

describe('Formatierung', () => {
  it('minutesToHoursLabel', () => {
    expect(minutesToHoursLabel(495)).toBe('8:15')
    expect(minutesToHoursLabel(0)).toBe('0:00')
  })

  it('formatHoursMinutes', () => {
    expect(formatHoursMinutes(7.83)).toBe('7 Std 50 Min')
    expect(formatHoursMinutes(0)).toBe('0 Std 0 Min')
  })

  it('escapeHtml', () => {
    expect(escapeHtml('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;')
  })
})

describe('Wochen-Helfer', () => {
  it('getWeekStart liefert Montag, getWeekEnd Sonntag', () => {
    // 2026-07-08 ist ein Mittwoch
    const wed = new Date(2026, 6, 8)
    expect(getWeekStart(wed).getDay()).toBe(1)
    expect(getWeekStart(wed).getDate()).toBe(6)
    expect(getWeekEnd(wed).getDay()).toBe(0)
    expect(getWeekEnd(wed).getDate()).toBe(12)
  })

  it('enumerateDays zählt beide Grenzen mit', () => {
    const days = enumerateDays(new Date(2026, 6, 6), new Date(2026, 6, 12))
    expect(days).toHaveLength(7)
  })
})

describe('buildDateFromTimeInput – Uhrzeit auf den Tag des Stempelsatzes legen', () => {
  const base = new Date(2026, 6, 8, 6, 17, 43, 500)

  it('setzt Stunde/Minute und nullt Sekunden', () => {
    const result = buildDateFromTimeInput(base, '07:45')
    expect(result?.getFullYear()).toBe(2026)
    expect(result?.getMonth()).toBe(6)
    expect(result?.getDate()).toBe(8)
    expect(result?.getHours()).toBe(7)
    expect(result?.getMinutes()).toBe(45)
    expect(result?.getSeconds()).toBe(0)
    expect(result?.getMilliseconds()).toBe(0)
  })

  it('lässt das Ausgangsdatum unverändert', () => {
    const before = base.getTime()
    buildDateFromTimeInput(base, '07:45')
    expect(base.getTime()).toBe(before)
  })

  it('gibt null bei leerer oder unsinniger Eingabe', () => {
    expect(buildDateFromTimeInput(base, '')).toBeNull()
    expect(buildDateFromTimeInput(base, 'abc')).toBeNull()
    expect(buildDateFromTimeInput(base, '25:00')).toBeNull()
    expect(buildDateFromTimeInput(base, '07:99')).toBeNull()
  })
})

describe('getReportRowChanges – nur echte Abweichungen speichern', () => {
  // Die Direkt-Speicherung im Zeiterfassungsbericht darf ausschließlich
  // Felder schreiben, die der Admin wirklich verändert hat. Sonst würden die
  // ungeglätteten Rohzeiten still auf das 15-Minuten-Raster überschrieben.
  const original: TimeEntry = {
    id: 'e1',
    employeeId: 'mitarbeiter-1',
    projectId: 'projekt-a',
    // 07:07 wird in der Anzeige auf 07:00 geglättet
    clockInTime: new Date(2026, 6, 8, 7, 7),
    // 16:05 wird in der Anzeige auf 16:00 geglättet
    clockOutTime: new Date(2026, 6, 8, 16, 5),
    pauseTotalTime: 30 * 60 * 1000
  }

  const row = (overrides: Partial<ReportEntry> = {}): ReportEntry => ({
    id: 'e1',
    originalEntry: original,
    source: 'time-entry',
    date: 'Mi., 08.07.2026',
    dateRaw: new Date(2026, 6, 8),
    dateKey: '2026-07-08',
    projectId: 'projekt-a',
    projectName: 'Projekt A',
    clockIn: '07:00',
    clockOut: '16:00',
    pauseMinutes: 30,
    pauseMs: 30 * 60 * 1000,
    workHours: '8:30',
    notes: '',
    originalNotes: '',
    isEdited: false,
    ...overrides
  })

  it('meldet keine Änderung für die unveränderte (geglättete) Zeile', () => {
    const changes = getReportRowChanges(row(), roundTimeToStep)
    expect(changes.any).toBe(false)
    expect(changes.originalClockIn).toBe('07:00')
    expect(changes.originalClockOut).toBe('16:00')
  })

  it('erkennt eine geänderte Kommen-Zeit isoliert', () => {
    const changes = getReportRowChanges(row({ clockIn: '08:00' }), roundTimeToStep)
    expect(changes).toMatchObject({ clockIn: true, clockOut: false, pause: false, project: false })
    expect(changes.any).toBe(true)
  })

  it('erkennt eine geänderte Pause isoliert', () => {
    const changes = getReportRowChanges(row({ pauseMinutes: 45 }), roundTimeToStep)
    expect(changes).toMatchObject({ clockIn: false, clockOut: false, pause: true, project: false })
  })

  it('erkennt einen Projektwechsel', () => {
    const changes = getReportRowChanges(row({ projectId: 'projekt-b' }), roundTimeToStep)
    expect(changes).toMatchObject({ project: true, clockIn: false, clockOut: false, pause: false })
  })

  it('wertet ein leeres Projektfeld nicht als Projektwechsel', () => {
    const changes = getReportRowChanges(row({ projectId: '' }), roundTimeToStep)
    expect(changes.project).toBe(false)
  })

  it('erkennt das Nachtragen einer Gehen-Zeit bei laufendem Stempelsatz', () => {
    const running: TimeEntry = { ...original, clockOutTime: null }
    const changes = getReportRowChanges(
      row({ originalEntry: running, clockOut: '16:00' }),
      roundTimeToStep
    )
    expect(changes.originalClockOut).toBe('')
    expect(changes.clockOut).toBe(true)
  })
})

describe('buildAdjustedReport – Korrektur bleibt außerhalb der Datenbank', () => {
  const original: TimeEntry = {
    id: 'e1',
    employeeId: 'mitarbeiter-1',
    projectId: 'projekt-a',
    clockInTime: new Date(2026, 6, 8, 7, 0),
    clockOutTime: new Date(2026, 6, 8, 16, 0),
    // Der Klassiker: 0 Minuten Pause gestempelt.
    pauseTotalTime: 0
  }

  const row = (overrides: Partial<ReportEntry> = {}): ReportEntry => ({
    id: 'e1',
    originalEntry: original,
    source: 'time-entry',
    date: 'Mi., 08.07.2026',
    dateRaw: new Date(2026, 6, 8),
    dateKey: '2026-07-08',
    projectId: 'projekt-a',
    projectName: 'Projekt A',
    clockIn: '07:00',
    clockOut: '16:00',
    pauseMinutes: 0,
    pauseMs: 0,
    workHours: '9:00',
    notes: '',
    originalNotes: '',
    isEdited: false,
    ...overrides
  })

  it('weist die gesetzliche Pause aus, ohne die Zeile zu verändern', () => {
    const entries = [row()]
    const report = buildAdjustedReport(entries)
    const adjusted = report.entries[0]

    expect(adjusted.effectivePauseMinutes).toBe(45)
    // Die Pause wird draufgerechnet, die geleisteten 9 Std bleiben stehen.
    expect(adjusted.effectiveWorkHours).toBe('9:00')
    expect(adjusted.effectiveClockOut).toBe('16:45')
    // Die Originalfelder – und nur die werden gespeichert – bleiben unberührt.
    expect(adjusted.pauseMinutes).toBe(0)
    expect(adjusted.clockOut).toBe('16:00')
    expect(entries[0].pauseMinutes).toBe(0)
  })

  it('löst durch die Automatik keinen Speicher-Zustand aus', () => {
    // Kernzusage an den Kunden: die automatische Korrektur darf niemals als
    // zu speichernde Änderung gelten, sonst landet sie in Firestore.
    const report = buildAdjustedReport([row()], {
      regularDayMinutes: 510,
      requestedPayoutMinutes: 60
    })
    const adjusted = report.entries[0]

    expect(adjusted.effectiveWorkHours).not.toBe(adjusted.workHours)
    const changes = getReportRowChanges(adjusted, roundTimeToStep)
    expect(changes.any).toBe(false)
  })

  it('lässt eine echte Admin-Änderung weiterhin als speicherbar durch', () => {
    const report = buildAdjustedReport([row({ pauseMinutes: 60, isEdited: true })])
    const changes = getReportRowChanges(report.entries[0], roundTimeToStep)
    expect(changes.pause).toBe(true)
    expect(changes.any).toBe(true)
  })
})

describe('Abrechnungs-Summen für den Beleg', () => {
  const workEntry = (day: number, cin: string, cout: string): ReportEntry => {
    const [ih, im] = cin.split(':').map(Number)
    const [oh, om] = cout.split(':').map(Number)
    const original: TimeEntry = {
      id: `e${day}`,
      employeeId: 'm1',
      projectId: 'p1',
      clockInTime: new Date(2026, 2, day, ih, im),
      clockOutTime: new Date(2026, 2, day, oh, om),
      pauseTotalTime: 0
    }
    return {
      id: `e${day}`,
      originalEntry: original,
      source: 'time-entry',
      date: `0${day}.03.2026`,
      dateRaw: new Date(2026, 2, day),
      dateKey: `2026-03-0${day}`,
      projectId: 'p1',
      projectName: 'Baustelle',
      clockIn: cin,
      clockOut: cout,
      pauseMinutes: 0,
      pauseMs: 0,
      workHours: '-',
      notes: '',
      originalNotes: '',
      isEdited: false
    }
  }

  const absenceEntry = (day: number, kind: AbsenceKind, minutes: number): ReportEntry => {
    const start = new Date(2026, 2, day, 7, 0)
    const original: TimeEntry = {
      id: `${kind}-${day}`,
      employeeId: 'm1',
      projectId: kind,
      clockInTime: start,
      clockOutTime: new Date(start.getTime() + minutes * 60000),
      pauseTotalTime: 0
    }
    return {
      id: `${kind}-${day}`,
      originalEntry: original,
      source: 'leave-request',
      date: `0${day}.03.2026`,
      dateRaw: new Date(2026, 2, day),
      dateKey: `2026-03-0${day}`,
      projectId: kind,
      projectName: kind,
      clockIn: '',
      clockOut: '',
      pauseMinutes: 0,
      pauseMs: 0,
      workHours: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`,
      notes: '',
      originalNotes: '',
      isEdited: false,
      isReadOnly: true,
      absenceKind: kind
    }
  }

  it('trennt Arbeitszeit, Urlaub, Feiertag und Krankheit', () => {
    const report = buildAdjustedReport(
      [
        workEntry(2, '07:00', '15:00'),
        absenceEntry(3, 'vacation', 8 * 60),
        absenceEntry(4, 'holiday', 8 * 60),
        absenceEntry(5, 'sick', 8 * 60),
        absenceEntry(6, 'vacation', 6 * 60)
      ],
      { hourlyRate: 20 }
    )

    expect(report.summary.workMinutes).toBe(8 * 60)
    expect(report.summary.workAmount).toBe(160)
    // Urlaub: Donnerstag 8 Std + Freitag 6 Std
    expect(report.summary.vacationMinutes).toBe(14 * 60)
    expect(report.summary.vacationAmount).toBe(280)
    expect(report.summary.holidayMinutes).toBe(8 * 60)
    expect(report.summary.sickDays).toBe(1)
    expect(report.summary.sickMinutes).toBe(8 * 60)
  })

  it('zählt Verpflegungsmehraufwand ab 8 Std Anwesenheit', () => {
    const report = buildAdjustedReport(
      [
        workEntry(2, '07:00', '15:00'), // exakt 8:00 → zählt
        workEntry(3, '07:00', '14:59'), // 7:59 → zählt nicht
        workEntry(4, '06:00', '17:00') // 11:00 → zählt
      ],
      { mealAllowanceRate: 14 }
    )
    expect(report.summary.mealAllowanceDays).toBe(2)
    expect(report.summary.mealAllowanceAmount).toBe(28)
  })

  it('löst für Urlaub, Krankheit und Feiertag KEINEN Verpflegungsmehraufwand aus', () => {
    // Der steuerfreie Satz setzt eine Auswärtstätigkeit voraus. Ein Urlaubstag
    // wird mit 8 Std Regelarbeitszeit ausgewiesen, ist aber keine Anwesenheit –
    // er darf den Satz deshalb nicht auslösen.
    const report = buildAdjustedReport(
      [
        absenceEntry(2, 'vacation', 8 * 60),
        absenceEntry(3, 'sick', 8 * 60),
        absenceEntry(4, 'holiday', 8 * 60)
      ],
      { mealAllowanceRate: 14 }
    )
    expect(report.summary.vacationMinutes).toBe(8 * 60)
    expect(report.summary.mealAllowanceDays).toBe(0)
    expect(report.summary.mealAllowanceAmount).toBe(0)
  })

  it('weist nur die noch offenen Überstunden aus', () => {
    const report = buildAdjustedReport([workEntry(2, '07:00', '17:00')], {
      regularDayMinutes: 480,
      requestedPayoutMinutes: 60,
      overtimeBalanceMinutes: 300
    })
    expect(report.payoutMinutes).toBe(60)
    expect(report.summary.openOvertimeMinutes).toBe(240)
  })

  it('meldet als Bruttolohn alle lohnwirksamen Stunden ohne steuerfreie Zuwendungen', () => {
    const report = buildAdjustedReport(
      [
        workEntry(2, '07:00', '15:00'),
        absenceEntry(3, 'vacation', 8 * 60),
        absenceEntry(4, 'holiday', 8 * 60),
        absenceEntry(5, 'sick', 8 * 60)
      ],
      { hourlyRate: 20, mealAllowanceRate: 14 }
    )

    // Arbeit + Feiertag + Krankheit = 3 × 8 Std × 20 €. Draußen bleiben der
    // steuerfreie Verpflegungsmehraufwand UND der Urlaub – letzterer wird im
    // Baulohn über die Urlaubskasse gesondert abgerechnet.
    expect(report.summary.grossWageMinutes).toBe(24 * 60)
    expect(report.summary.grossWageAmount).toBe(480)
    expect(report.summary.taxFreeAmount).toBe(14)
    expect(report.summary.totalPayoutAmount).toBe(494)
  })

  it('meldet Urlaub in Tagen und hält ihn aus dem Bruttolohn heraus', () => {
    const report = buildAdjustedReport(
      [
        workEntry(2, '07:00', '15:00'),
        absenceEntry(3, 'vacation', 8 * 60),
        absenceEntry(4, 'vacation', 8 * 60)
      ],
      { hourlyRate: 20, mealAllowanceRate: 0 }
    )

    // Die Tage stehen weiterhin auf dem Beleg …
    expect(report.summary.vacationDays).toBe(2)
    expect(report.summary.vacationMinutes).toBe(16 * 60)
    // … der Betrag daraus fließt aber nicht in den Bruttolohn.
    expect(report.summary.grossWageMinutes).toBe(8 * 60)
    expect(report.summary.grossWageAmount).toBe(160)
  })

  it('lässt Urlaubsstunden aus der Belegsumme heraus', () => {
    const report = buildAdjustedReport(
      [
        workEntry(2, '07:00', '15:00'),
        absenceEntry(3, 'vacation', 8 * 60),
        absenceEntry(4, 'sick', 8 * 60)
      ],
      { hourlyRate: 20, mealAllowanceRate: 0 }
    )

    // Die Zeile behält ihre Minuten (sie steht ja im Bericht) …
    expect(report.shownTotalMinutes).toBe(24 * 60)
    // … die Summe unter dem Beleg zählt den Urlaub aber nicht mit.
    expect(report.documentTotalMinutes).toBe(16 * 60)
    expect(report.documentTotalMinutes).toBe(report.summary.grossWageMinutes)
  })

  it('vergütet Berufsschultage wie Arbeitszeit und weist sie getrennt aus', () => {
    const report = buildAdjustedReport(
      [workEntry(2, '07:00', '15:00'), absenceEntry(3, 'school', 8 * 60)],
      { hourlyRate: 20, mealAllowanceRate: 0 }
    )

    expect(report.summary.schoolDays).toBe(1)
    expect(report.summary.schoolMinutes).toBe(8 * 60)
    // Berufsschule ist bezahlte Zeit – anders als Urlaub bleibt sie im Bruttolohn.
    expect(report.summary.grossWageMinutes).toBe(16 * 60)
    expect(report.summary.grossWageAmount).toBe(320)
  })

  it('summiert den Bruttolohn aus den gerundeten Einzelzeilen', () => {
    // 20,01 €/Std auf krumme Stunden – Beleg und Summe müssen aufgehen.
    const report = buildAdjustedReport(
      [workEntry(2, '07:00', '14:20'), absenceEntry(3, 'vacation', 7 * 60 + 20)],
      { hourlyRate: 20.01, mealAllowanceRate: 0 }
    )

    // Urlaub zählt hier bewusst nicht mit – er ist nicht Teil des Bruttolohns.
    const { workAmount, holidayAmount, sickAmount, schoolAmount, grossWageAmount } = report.summary
    expect(grossWageAmount).toBe(
      Math.round((workAmount + holidayAmount + sickAmount + schoolAmount) * 100) / 100
    )
  })

  it('rechnet mit 0 auch im Beleg – der Betrag bleibt 0', () => {
    const report = buildAdjustedReport([workEntry(2, '07:00', '15:00')], {
      hourlyRate: 20,
      mealAllowanceRate: parseMealAllowanceInput('0 €')
    })
    expect(report.summary.mealAllowanceRate).toBe(0)
    expect(report.summary.mealAllowanceAmount).toBe(0)
    expect(report.summary.taxFreeAmount).toBe(0)
    // Die Auszahlung ist dann exakt der Bruttolohn.
    expect(report.summary.totalPayoutAmount).toBe(report.summary.grossWageAmount)
  })

  describe('Azubi mit Fixlohn', () => {
    const entries = [
      workEntry(2, '07:00', '15:00'),
      absenceEntry(3, 'vacation', 8 * 60),
      absenceEntry(5, 'sick', 8 * 60)
    ]

    it('weist den Fixlohn als Bruttolohn aus, nicht Stunden × Satz', () => {
      const report = buildAdjustedReport(entries, {
        hourlyRate: 20,
        isApprentice: true,
        fixedMonthlySalary: 850,
        mealAllowanceRate: 0
      })

      expect(report.summary.isFixedSalary).toBe(true)
      expect(report.summary.grossWageAmount).toBe(850)
    })

    it('lässt die Zeilenbeträge leer, die Zeiten stehen aber weiter im Bericht', () => {
      const report = buildAdjustedReport(entries, {
        hourlyRate: 20,
        isApprentice: true,
        fixedMonthlySalary: 850,
        mealAllowanceRate: 0
      })

      // Keine Beträge je Zeile …
      expect(report.summary.workAmount).toBe(0)
      expect(report.summary.vacationAmount).toBe(0)
      expect(report.summary.sickAmount).toBe(0)
      // … der Stundensatz taucht gar nicht erst auf …
      expect(report.summary.hourlyRate).toBe(0)
      // … die abgerechneten Zeiten bleiben aber vollständig erhalten.
      expect(report.summary.workMinutes).toBe(8 * 60)
      expect(report.summary.vacationMinutes).toBe(8 * 60)
      expect(report.summary.sickMinutes).toBe(8 * 60)
      // Ohne Urlaub: Arbeit + Krankheit.
      expect(report.summary.grossWageMinutes).toBe(16 * 60)
    })

    it('rechnet den steuerfreien Verpflegungsmehraufwand zusätzlich zum Fixlohn', () => {
      const report = buildAdjustedReport(entries, {
        isApprentice: true,
        fixedMonthlySalary: 850,
        mealAllowanceRate: 14
      })

      expect(report.summary.taxFreeAmount).toBe(14)
      expect(report.summary.totalPayoutAmount).toBe(864)
    })

    it('bleibt ohne hinterlegten Fixlohn bei 0 statt auf den Stundensatz zurückzufallen', () => {
      const report = buildAdjustedReport(entries, {
        hourlyRate: 20,
        isApprentice: true,
        mealAllowanceRate: 0
      })

      expect(report.summary.grossWageAmount).toBe(0)
    })

    it('rechnet ohne Azubi-Kennzeichen weiter nach Stunden, auch mit gesetztem Fixlohn', () => {
      const report = buildAdjustedReport(entries, {
        hourlyRate: 20,
        fixedMonthlySalary: 850,
        mealAllowanceRate: 0
      })

      expect(report.summary.isFixedSalary).toBe(false)
      // Arbeit + Krankheit × 20 € (Urlaub läuft über den Baulohn).
      expect(report.summary.grossWageAmount).toBe(320)
    })
  })
})

describe('parseMealAllowanceInput', () => {
  it('lässt 0 als gültigen Satz durch', () => {
    expect(parseMealAllowanceInput('0')).toBe(0)
    expect(parseMealAllowanceInput('0,00')).toBe(0)
    expect(parseMealAllowanceInput('0.00')).toBe(0)
  })

  it('schluckt das Euro-Zeichen – das Feld ist mit €/Tag beschriftet', () => {
    // Ohne diese Bereinigung wäre "0 €" ungültig und fiele auf 14 zurück:
    // aus einer bewussten Null würde unbemerkt der Standardsatz.
    expect(parseMealAllowanceInput('0 €')).toBe(0)
    expect(parseMealAllowanceInput('0€')).toBe(0)
    expect(parseMealAllowanceInput('14 €')).toBe(14)
  })

  it('behandelt ein leeres Feld als 0', () => {
    expect(parseMealAllowanceInput('')).toBe(0)
    expect(parseMealAllowanceInput('   ')).toBe(0)
  })

  it('nimmt Komma und Punkt als Dezimaltrenner', () => {
    expect(parseMealAllowanceInput('13,5')).toBe(13.5)
    expect(parseMealAllowanceInput('13.5')).toBe(13.5)
  })

  it('fällt nur bei wirklich unlesbaren Eingaben auf den Standardsatz zurück', () => {
    expect(parseMealAllowanceInput('abc')).toBe(DEFAULT_MEAL_ALLOWANCE_EUR)
    expect(parseMealAllowanceInput('-5')).toBe(DEFAULT_MEAL_ALLOWANCE_EUR)
  })

})

describe('Gemeldete Stunden in die Zeilen übernehmen (Ende zu Ende)', () => {
  /** Mo–Fr ab 06.07.2026, jeweils 07:00–17:00 = 10:00 gestempelt, 50:00 gesamt. */
  const woche = (): ReportEntry[] =>
    [6, 7, 8, 9, 10].map((tag) => {
      const original: TimeEntry = {
        id: `w${tag}`,
        employeeId: 'm1',
        projectId: 'p1',
        clockInTime: new Date(2026, 6, tag, 7, 0),
        clockOutTime: new Date(2026, 6, tag, 17, 0),
        pauseTotalTime: 0
      }
      return {
        id: `w${tag}`,
        originalEntry: original,
        source: 'time-entry',
        date: `${tag}.07.2026`,
        dateRaw: new Date(2026, 6, tag),
        dateKey: `2026-07-${String(tag).padStart(2, '0')}`,
        projectId: 'p1',
        projectName: 'Projekt',
        clockIn: '07:00',
        clockOut: '17:00',
        pauseMinutes: 0,
        pauseMs: 0,
        workHours: '10:00',
        notes: '',
        originalNotes: '',
        isEdited: false
      } as ReportEntry
    })

  /** Genau das, was der „Übernehmen"-Knopf im Bericht macht. */
  const uebernehmen = (entries: ReportEntry[], ziel: number) => {
    const ungedeckelt = buildAdjustedReport(entries)
    const plan = planSettlementTarget(
      ungedeckelt.days.map((d) => d.legalWorkMinutes),
      ziel
    )
    return buildAdjustedReport(entries, {
      regularDayMinutes: plan.dailyCapMinutes,
      requestedPayoutMinutes: plan.payoutMinutes
    })
  }

  it('trifft ein Ziel unter der gestempelten Zeit', () => {
    // Der Fall aus der Praxis: gemeldet wird WENIGER als bisher ausgewiesen.
    const ziel = 40 * 60
    expect(uebernehmen(woche(), ziel).summary.workMinutes).toBe(ziel)
  })

  it('trifft auch krumme Ziele exakt', () => {
    for (const ziel of [2401, 2400, 1234, 60, 0]) {
      expect(uebernehmen(woche(), ziel).summary.workMinutes).toBe(ziel)
    }
  })

  it('lässt die volle gestempelte Zeit unverändert', () => {
    const ziel = 50 * 60
    const ergebnis = uebernehmen(woche(), ziel)
    expect(ergebnis.summary.workMinutes).toBe(ziel)
    expect(ergebnis.payoutUnallocatedMinutes).toBe(0)
  })

  it('zahlt Überstunden über die gestempelte Zeit hinaus aus', () => {
    // 50:00 gestempelt, 52:00 gemeldet – die 2:00 kommen vom Konto und werden
    // auf Tage mit Luft bis zur 10-Std-Grenze verteilt. Hier ist jeder Tag
    // bereits bei 10:00, also bleibt die Differenz unverteilbar.
    const ergebnis = uebernehmen(woche(), 52 * 60)
    expect(ergebnis.payoutUnallocatedMinutes).toBeGreaterThan(0)
  })
})

describe('planSettlementTarget – gemeldete Stunden treffen', () => {
  const tage = [600, 600, 600, 600, 480] // 4 × 10:00 + 1 × 8:00 = 48:00

  const summeMit = (deckel: number, payout: number): number => {
    const gedeckelt = tage.map((m) => Math.min(m, deckel))
    // Der Rest verteilt sich auf Tage mit Luft bis zur gestempelten Zeit.
    let rest = payout
    return gedeckelt.reduce((sum, m, i) => {
      const luft = Math.max(0, tage[i] - m)
      const zusatz = Math.min(luft, rest)
      rest -= zusatz
      return sum + m + zusatz
    }, 0)
  }

  it('kürzt auf ein Ziel unter der gestempelten Zeit', () => {
    const ziel = 40 * 60
    const plan = planSettlementTarget(tage, ziel)
    expect(summeMit(plan.dailyCapMinutes, plan.payoutMinutes)).toBe(ziel)
  })

  it('trifft auch krumme Ziele exakt', () => {
    // Genau der Fall aus der Praxis: gemeldet weniger als die Regelarbeitszeit
    for (const ziel of [2401, 2400, 1234, 1, 0]) {
      const plan = planSettlementTarget(tage, ziel)
      expect(summeMit(plan.dailyCapMinutes, plan.payoutMinutes)).toBe(ziel)
    }
  })

  it('lässt die Zeiten unangetastet, wenn das Ziel der gestempelten Zeit entspricht', () => {
    const ziel = tage.reduce((a, b) => a + b, 0)
    const plan = planSettlementTarget(tage, ziel)
    expect(plan.payoutMinutes).toBe(0)
    expect(summeMit(plan.dailyCapMinutes, plan.payoutMinutes)).toBe(ziel)
  })

  it('fordert für ein Ziel über der gestempelten Zeit eine Auszahlung an', () => {
    // Überstunden vom Konto: mehr abrechnen als gestempelt
    const gesamt = tage.reduce((a, b) => a + b, 0)
    const plan = planSettlementTarget(tage, gesamt + 5 * 60)
    expect(plan.payoutMinutes).toBe(5 * 60)
  })

  it('kommt mit einem leeren Zeitraum klar', () => {
    // Ohne Tage ist der Deckel bedeutungslos; entscheidend ist, dass die
    // gemeldeten Stunden vollständig als Auszahlung angefordert werden.
    expect(planSettlementTarget([], 0).payoutMinutes).toBe(0)
    expect(planSettlementTarget([], 120).payoutMinutes).toBe(120)
  })
})

describe('employeeLaborCostRate', () => {
  it('addiert Kostensatz und Lohnnebenkosten', () => {
    expect(employeeLaborCostRate({ hourlyCostRate: 24.5, ancillaryWageCosts: 8.75 })).toBe(33.25)
  })

  it('ignoriert den Verrechnungssatz vollständig', () => {
    // hourlyRate/hourlyWage sind der Verkaufspreis der Stunde und dürfen nie
    // als Lohn auf dem Beleg landen.
    const rate = employeeLaborCostRate({
      hourlyCostRate: 20,
      ancillaryWageCosts: 0,
      hourlyRate: 65,
      hourlyWage: 55
    } as never)
    expect(rate).toBe(20)
  })

  it('rechnet fehlende oder unsinnige Werte als 0', () => {
    expect(employeeLaborCostRate(undefined)).toBe(0)
    expect(employeeLaborCostRate({})).toBe(0)
    expect(employeeLaborCostRate({ hourlyCostRate: -5, ancillaryWageCosts: 7 })).toBe(7)
    expect(employeeLaborCostRate({ ancillaryWageCosts: 6.5 })).toBe(6.5)
  })
})

describe('employeeBillingRate / employeeHourlyMargin', () => {
  it('nimmt den gepflegten Verrechnungssatz vor dem Altfeld', () => {
    expect(employeeBillingRate({ hourlyRate: 65, hourlyWage: 40 })).toBe(65)
  })

  it('fällt auf hourlyWage zurück, solange kein Verrechnungssatz gepflegt ist', () => {
    expect(employeeBillingRate({ hourlyWage: 40 })).toBe(40)
    expect(employeeBillingRate({})).toBe(0)
  })

  it('rechnet die Marge je Stunde als Verrechnung minus Lohnkosten', () => {
    const marge = employeeHourlyMargin({
      hourlyRate: 60,
      hourlyCostRate: 24,
      ancillaryWageCosts: 9
    })
    expect(marge).toBe(27)
  })

  it('wird negativ, wenn die Lohnkosten über dem Verrechnungssatz liegen', () => {
    expect(employeeHourlyMargin({ hourlyRate: 30, hourlyCostRate: 34, ancillaryWageCosts: 6 })).toBe(
      -10
    )
  })
})

describe('isReportSelectableEmployee', () => {
  const emp = (over: Partial<Employee>): Employee =>
    ({ username: 'mitarbeiter', name: 'Max Muster', ...over }) as Employee

  it('lässt die Geschäftsführung trotz Admin-Rechten zur Auswahl', () => {
    // Regression: das Admin-Häkchen hat den GF aus dem Bericht geworfen, obwohl
    // er stempelt und einen Lohnbeleg braucht.
    expect(isReportSelectableEmployee(emp({ name: 'Timo Reislöhner', isAdmin: true }))).toBe(true)
  })

  it('blendet ausgeschiedene Mitarbeiter aus', () => {
    expect(isReportSelectableEmployee(emp({ status: 'inactive' }))).toBe(false)
    expect(isReportSelectableEmployee(emp({ status: 'active' }))).toBe(true)
  })

  it('blendet das technische Administrator-Konto aus', () => {
    expect(isReportSelectableEmployee(emp({ username: 'admin', name: 'Administrator' }))).toBe(false)
    expect(isReportSelectableEmployee(emp({ username: 'irgendwas', name: 'Administrator' }))).toBe(
      false
    )
  })

  it('trifft nur das Konto selbst, nicht jeden Namen mit „admin" darin', () => {
    expect(isReportSelectableEmployee(emp({ name: 'Sabine Adminger' }))).toBe(true)
  })
})
