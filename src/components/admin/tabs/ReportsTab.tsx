import { useState, useEffect, useMemo, useRef } from 'react'
import { DataService } from '../../../services/dataService'
import type { Employee, TimeEntry, Project, FileUpload, TimeReportSettlement, OvertimeSettlement, MaterialCredit, MaterialType } from '../../../types'
import { toast } from '../../ToastContainer'
import { formatDateForInputLocal } from '../../../utils/dateUtils'
import { getReturnTravelCreditMs } from '../../../utils/returnTravel'
import { getBavariaHolidayName } from '../../../utils/bavariaHolidays'
import { collectEntryDocumentation } from '../../../utils/entryDocumentation'
import { getFileImageSrc } from '../../../utils/fileImageSrc'
import { roundTimeToStep } from '../../../utils/timeRounding'
import {
  type ReportType,
  type ReportEntry,
  type EmployeeSummary,
  type AbsenceKind,
  convertToDate,
  formatDateForDisplay,
  getDateKey,
  getApprovedLeaveDates,
  enumerateDays,
  isWeekendDate,
  DEFAULT_MEAL_ALLOWANCE_EUR,
  parseMealAllowanceInput,
  formatTimeForInput,
  formatHoursMinutes,
  calculateWorkHours,
  msToMinutes,
  entryCreditMinutes,
  workMinutesFromParts,
  minutesToHoursLabel,
  minutesToDecimalHours,
  workMinutesFromOriginalEntry,
  formatCurrency,
  buildDateFromTimeInput,
  getReportRowChanges,
  buildAdjustedReport,
  buildAdjustedReportForTarget,
  type BuildAdjustedReportOptions,
  type AdjustedReportEntry
} from './reports/reportUtils'
import { parseHoursMinutesInput } from './reports/workTimeRules'
import { buildDatevRows, DATEV_KEY_LEGEND, datevTotalMinutes } from './reports/datevReport'
import {
  buildDatevBatchPrintHtml,
  buildDatevPrintHtml,
  type DatevPrintParams
} from './reports/datevPrintHtml'
import {
  monthKeyForPeriod,
  monthKeyLabel,
  monthRange,
  previousMonthKey
} from '../../../utils/overtimeMonth'
import {
  getReportMailConfig,
  isValidEmail,
  saveReportMailRecipient,
  sendReportMail,
  type ReportMailAttachment
} from '../../../services/reportMailService'
import {
  DEFAULT_REGULAR_WORK_TIME,
  regularMinutesForDate,
  regularMinutesForDateKey,
  type RegularWorkTimeConfig
} from '../../../utils/regularWorkTime'
import {
  COMPANY_NAME,
  buildEmployeeBatchPrintHtml,
  buildEmployeePrintHtml,
  buildProjectStaffPrintHtml,
  type EmployeePrintParams
} from './reports/printHtml'
import SearchableSelect from '../../SearchableSelect'
import ReportAddEntryModal from '../ReportAddEntryModal'
import '../../../styles/AdminTabs.css'
import '../../../styles/ReportPrint.css'

/**
 * Merker, ob Zeilenänderungen im Zeiterfassungsbericht sofort in die Datenbank
 * geschrieben werden (Kundenwunsch) oder – wie früher – nur temporär für den
 * Druck bzw. die Abrechnung „Restliche Stunden" gelten.
 */
const DIRECT_SAVE_STORAGE_KEY = 'lauffer_report_direct_save'

interface ReportsTabProps {
  defaultReportType?: ReportType
  allowedReportTypes?: ReportType[]
}

const ReportsTab: React.FC<ReportsTabProps> = ({
  defaultReportType = 'employee',
  allowedReportTypes
}) => {
  const availableReportTypes: ReportType[] =
    allowedReportTypes && allowedReportTypes.length > 0
      ? allowedReportTypes
      : ['employee', 'project', 'datev']

  const getInitialReportType = (): ReportType => {
    if (availableReportTypes.includes(defaultReportType)) {
      return defaultReportType
    }
    return availableReportTypes[0] || 'employee'
  }

  const [reportType, setReportType] = useState<ReportType>(getInitialReportType)
  
  // Gemeinsame States
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Mitarbeiter-Bericht States
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('')
  const [reportEntries, setReportEntries] = useState<ReportEntry[]>([])
  const [employeeSettlement, setEmployeeSettlement] = useState<TimeReportSettlement | null>(null)
  const [employeeReportView, setEmployeeReportView] = useState<'full' | 'remainder'>('full')
  const [isSavingSettlement, setIsSavingSettlement] = useState(false)
  // Direktes Speichern der Zeilen-Korrekturen in die Datenbank (Kundenwunsch)
  const [directSave, setDirectSave] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DIRECT_SAVE_STORAGE_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const [savingEntryIds, setSavingEntryIds] = useState<Set<string>>(new Set())
  const [savedEntryIds, setSavedEntryIds] = useState<Set<string>>(new Set())
  const [showAddEntryModal, setShowAddEntryModal] = useState(false)
  // Überstunden-Modus: weist im Bericht nur die Regelarbeitszeit aus und
  // verteilt einen bewusst eingegebenen Auszahlungsbetrag auf die Zeilen.
  const [overtimeMode, setOvertimeMode] = useState(false)
  const [regularMonThuInput, setRegularMonThuInput] = useState(() =>
    minutesToHoursLabel(DEFAULT_REGULAR_WORK_TIME.monThu)
  )
  const [regularFriInput, setRegularFriInput] = useState(() =>
    minutesToHoursLabel(DEFAULT_REGULAR_WORK_TIME.fri)
  )
  const [mealAllowanceInput, setMealAllowanceInput] = useState(String(DEFAULT_MEAL_ALLOWANCE_EUR))

  /** Regelarbeitszeit Mo–Do / Fr; ungültige Eingaben fallen auf 8:00 bzw. 6:00 zurück. */
  const regularWorkTimeConfig: RegularWorkTimeConfig = {
    monThu: parseHoursMinutesInput(regularMonThuInput) ?? DEFAULT_REGULAR_WORK_TIME.monThu,
    fri: parseHoursMinutesInput(regularFriInput) ?? DEFAULT_REGULAR_WORK_TIME.fri
  }
  const mealAllowanceRate = parseMealAllowanceInput(mealAllowanceInput)
  const [payoutInput, setPayoutInput] = useState('0:00')
  /** Übernommener Auszahlungsbetrag – erst ein Klick auf „In Zeilen übernehmen" setzt ihn. */
  const [appliedPayoutMinutes, setAppliedPayoutMinutes] = useState(0)
  /** Alle Abrechnungs-Meldungen des gewählten Mitarbeiters (neueste zuerst). */
  const [employeeSettlements, setEmployeeSettlements] = useState<OvertimeSettlement[]>([])
  /** Übernommene Meldung: Zielsumme, auf die die Zeilen gebracht werden. */
  const [appliedSettlementTarget, setAppliedSettlementTarget] = useState<number | null>(null)
  /** Monatsend-Aufruf an alle Mitarbeiter (Popup in der App + Push aufs Handy). */
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  // ---- Sammellauf „Auswertung für alle" ----
  /** Mitarbeiter mit mindestens einer Stempelung im Zeitraum, in Blätter-Reihenfolge. */
  const [batchEmployeeIds, setBatchEmployeeIds] = useState<string[]>([])
  /** Welcher davon gerade angezeigt wird. */
  const [batchIndex, setBatchIndex] = useState(0)
  /**
   * Wer beim Sammeldruck und -versand dabei ist. Startet mit allen; wer beim
   * Durchblättern abgehakt wird, fällt aus beidem heraus – gedacht für den
   * Mitarbeiter, dessen Zeiten diesen Monat noch nicht stimmen.
   */
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())
  /**
   * Zeitraum, für den der Sammellauf gebaut wurde. Bewusst eingefroren: ändert
   * jemand danach die Datumsfelder, blättert und druckt der Lauf trotzdem den
   * Zeitraum, zu dem die Mitarbeiterliste ermittelt wurde.
   */
  const [batchPeriod, setBatchPeriod] = useState<{ start: string; end: string } | null>(null)
  const [isBatchLoading, setIsBatchLoading] = useState(false)
  /** Fortschritt des Sammeldrucks (Anzahl fertiger Mitarbeiter), null = kein Druck. */
  const [batchPrintProgress, setBatchPrintProgress] = useState<number | null>(null)
  /** Fortschritt des Sammelversands, null = es läuft keiner. */
  const [batchMailProgress, setBatchMailProgress] = useState<number | null>(null)
  /** Gemeldete Stunden im Sammellauf automatisch in die Zeilen übernehmen. */
  const [batchApplyReported, setBatchApplyReported] = useState(true)
  /** E-Mail-Versand des Berichts – Empfänger ist gepflegt, nicht fest verdrahtet. */
  const [mailRecipient, setMailRecipient] = useState('')
  const [mailNote, setMailNote] = useState('')
  const [isSendingMail, setIsSendingMail] = useState(false)
  const savedFlashTimeoutsRef = useRef<Map<string, number>>(new Map())
  /** Läuft bereits ein Speichervorgang für diese Zeile? (verhindert Doppel-Schreiben) */
  const savingGuardRef = useRef<Set<string>>(new Set())

  // Projekt-Bericht States
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [employeeSummaries, setEmployeeSummaries] = useState<EmployeeSummary[]>([])
  const [projectPhotos, setProjectPhotos] = useState<FileUpload[]>([])
  const [projectDocuments, setProjectDocuments] = useState<FileUpload[]>([])
  const [projectRawEntries, setProjectRawEntries] = useState<TimeEntry[]>([])
  const [projectMaterialCredits, setProjectMaterialCredits] = useState<MaterialCredit[]>([])
  // Materialkatalog (für Einkaufspreis/Marge in der Nachkalkulation)
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [expandedProjectDays, setExpandedProjectDays] = useState<Set<string>>(new Set())
  const [lightboxImage, setLightboxImage] = useState<FileUpload | null>(null)
  const [journalEntryDetail, setJournalEntryDetail] = useState<{ entry: TimeEntry; dayLabel: string } | null>(null)
  const [useTimeFilter, setUseTimeFilter] = useState(false)
  const [isPreparingPrint, setIsPreparingPrint] = useState(false)
  const printResetTimeoutRef = useRef<number | null>(null)
  const isPrintInProgressRef = useRef(false)

  const clearPrintResetTimeout = () => {
    if (printResetTimeoutRef.current !== null) {
      window.clearTimeout(printResetTimeoutRef.current)
      printResetTimeoutRef.current = null
    }
  }

  const resetPrintPreparation = () => {
    clearPrintResetTimeout()
    isPrintInProgressRef.current = false
    setIsPreparingPrint(false)
  }

  useEffect(() => {
    loadInitialData()
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setStartDate(formatDateForInputLocal(firstDay))
    setEndDate(formatDateForInputLocal(lastDay))
    getReportMailConfig()
      .then(config => setMailRecipient(config.recipient))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleAfterPrint = () => {
      resetPrintPreparation()
    }

    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint)
      clearPrintResetTimeout()
    }
  }, [])

  // Reset wenn Berichtstyp wechselt
  /**
   * Verpflegungssatz des gewählten Mitarbeiters als Vorgabe ins Feld holen.
   * Er bleibt überschreibbar – die Pflege gehört aber an die Mitarbeiter-Karte,
   * damit nicht bei jedem Bericht neu getippt werden muss.
   */
  useEffect(() => {
    const satz = employees.find(e => e.id === selectedEmployeeId)?.mealAllowanceRate
    setMealAllowanceInput(
      String(typeof satz === 'number' ? satz : DEFAULT_MEAL_ALLOWANCE_EUR).replace('.', ',')
    )
  }, [selectedEmployeeId, employees])

  useEffect(() => {
    setHasSearched(false)
    setReportEntries([])
    // Der Sammellauf gehört zum geladenen Bericht – beim Wechsel des
    // Berichtstyps ist er hinfällig und wird neu ausgelöst.
    exitBatchMode()
    setEmployeeSettlement(null)
    setEmployeeReportView('full')
    setEmployeeSummaries([])
    setProjectPhotos([])
    setProjectDocuments([])
    setProjectRawEntries([])
    setProjectMaterialCredits([])
    setExpandedProjectDays(new Set())
  }, [reportType])

  const loadInitialData = async () => {
    try {
      const [fetchedEmployees, fetchedProjects, fetchedMaterialTypes] = await Promise.all([
        DataService.getAllEmployees(),
        DataService.getAllProjects(),
        DataService.getAllMaterialTypes()
      ])

      setAllEmployees(fetchedEmployees)
      setMaterialTypes(fetchedMaterialTypes)
      
      const filteredEmployees = fetchedEmployees.filter(e => {
        if (e.status === 'inactive') return false
        if (e.isAdmin) return false
        const name = (e.name || `${e.firstName} ${e.lastName}`).toLowerCase()
        if (name.includes('administrator') || name.includes('admin')) return false
        return true
      })
      setEmployees(filteredEmployees)
      setProjects(fetchedProjects)
    } catch (error) {
      console.error('Fehler beim Laden:', error)
      toast.error('Fehler beim Laden der Daten')
    }
  }

  const getProjectName = (projectId: string): string => {
    const project = projects.find(p => p.id === projectId)
    return project?.name || projectId
  }

  /** Anzeigename eines Mitarbeiters; leer, wenn er nicht (mehr) geladen ist. */
  const employeeDisplayName = (employeeId: string): string => {
    const emp =
      employees.find(e => e.id === employeeId) || allEmployees.find(e => e.id === employeeId)
    return emp ? emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : ''
  }

  // ==================== MITARBEITER-BERICHT ====================
  /**
   * Baut die Berichtszeilen eines Mitarbeiters für einen Zeitraum: gestempelte
   * Zeiten plus die bezahlten Abwesenheiten (Feiertag, Urlaub, Krankheit).
   *
   * Bewusst ohne Zugriff auf den ausgewählten Mitarbeiter und ohne State-
   * Änderungen – „Auswertung für alle" ruft dieselbe Logik nacheinander für
   * jeden Mitarbeiter auf.
   *
   * @param options.includeFileBinaries Bilddaten mitladen. Der Bericht liest aus
   *   den Dateien nur die Kommentare; für den Sammellauf bleiben die Binärdaten
   *   deshalb außen vor.
   */
  const loadReportEntriesFor = async (
    employeeId: string,
    von: string,
    bis: string,
    options?: { includeFileBinaries?: boolean }
  ): Promise<ReportEntry[]> => {
    const start = new Date(von)
    start.setHours(0, 0, 0, 0)
    const end = new Date(bis)
    end.setHours(23, 59, 59, 999)

    // Zeitraum serverseitig vorfiltern; der Filter unten bleibt als
    // Absicherung (die Query darf eine Obermenge liefern).
    const [allEntries, leaveRequests] = await Promise.all([
      DataService.getTimeEntriesByEmployeeId(employeeId, { from: start, to: end }),
      DataService.getLeaveRequestsByEmployee(employeeId)
    ])

    const filteredEntries = allEntries.filter(entry => {
      const entryDate = convertToDate(entry.clockInTime)
      if (!entryDate) return false
      return entryDate >= start && entryDate <= end
    })

    filteredEntries.sort((a, b) => {
      const dateA = convertToDate(a.clockInTime)
      const dateB = convertToDate(b.clockInTime)
      if (!dateA || !dateB) return 0
      return dateA.getTime() - dateB.getTime()
    })

    const entryIds = filteredEntries.map(e => e.id)
    const linkedFiles =
      entryIds.length > 0
        ? await DataService.getFileUploadsByTimeEntryIds(entryIds, {
            includeBinary: options?.includeFileBinaries !== false
          })
        : []
    const filesByEntryId = new Map<string, FileUpload[]>()
    for (const file of linkedFiles) {
      if (!file.timeEntryId) continue
      const list = filesByEntryId.get(file.timeEntryId) || []
      list.push(file)
      filesByEntryId.set(file.timeEntryId, list)
    }

    const entries: ReportEntry[] = filteredEntries.map(entry => {
      const clockInDate = convertToDate(entry.clockInTime)
      const clockOutDate = convertToDate(entry.clockOutTime)
      // Zeiten auf 15-Min-Raster glätten (Anzeige + Stundenberechnung)
      const clockIn = formatTimeForInput(roundTimeToStep(clockInDate))
      const clockOut = formatTimeForInput(roundTimeToStep(clockOutDate))
      const pauseMs = entry.pauseTotalTime || 0
      const pauseMinutes = msToMinutes(pauseMs)

      return {
        id: entry.id,
        originalEntry: entry,
        source: 'time-entry',
        date: clockInDate ? formatDateForDisplay(clockInDate) : '-',
        dateRaw: clockInDate,
        dateKey: clockInDate ? getDateKey(clockInDate) : '',
        projectId: entry.projectId,
        projectName:
          entry.customerId && !entry.projectId
            ? `Kleinauftrag: ${entry.customerName || 'Kunde'}`
            : getProjectName(entry.projectId),
        clockIn,
        clockOut,
        pauseMinutes,
        pauseMs,
        workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes, entryCreditMinutes(entry)),
        notes: collectEntryDocumentation(entry, filesByEntryId.get(entry.id) || []),
        originalNotes: collectEntryDocumentation(entry, filesByEntryId.get(entry.id) || []),
        isEdited: false,
        holidayName: clockInDate ? getBavariaHolidayName(clockInDate) : null
      }
    })

    const occupiedTimeEntryDates = new Set(
      entries
        .map((entry) => entry.dateKey)
        .filter((dateKey) => !!dateKey)
    )

    /**
     * Baut eine bezahlte Abwesenheitszeile. Vergütet wird immer mit der
     * Regelarbeitszeit des Wochentags (Mo–Do 8 Std, Fr 6 Std).
     */
    const buildAbsenceRow = (
      date: Date,
      kind: AbsenceKind,
      idPrefix: string,
      projectName: string,
      notes: string
    ): ReportEntry => {
      const dateKey = getDateKey(date)
      const minutes = regularMinutesForDate(date, regularWorkTimeConfig)
      const syntheticClockIn = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0, 0, 0)
      const syntheticClockOut = new Date(syntheticClockIn.getTime() + minutes * 60 * 1000)
      const originalEntry: TimeEntry = {
        id: `${idPrefix}-${dateKey}`,
        employeeId,
        projectId: kind,
        clockInTime: syntheticClockIn,
        clockOutTime: syntheticClockOut,
        pauseTotalTime: 0,
        notes,
        isVacationDay: kind === 'vacation'
      }
      return {
        id: originalEntry.id,
        originalEntry,
        source: 'leave-request',
        date: formatDateForDisplay(date),
        dateRaw: date,
        dateKey,
        projectId: kind,
        projectName,
        clockIn: '',
        clockOut: '',
        pauseMinutes: 0,
        pauseMs: 0,
        workHours: minutesToHoursLabel(minutes),
        notes,
        originalNotes: notes,
        isEdited: false,
        isReadOnly: true,
        absenceKind: kind,
        holidayName: getBavariaHolidayName(date)
      }
    }

    // Feiertage zuerst: an einem gesetzlichen Feiertag kann niemand Urlaub
    // nehmen oder krank sein, der Feiertag hat Vorrang.
    const holidayEntries: ReportEntry[] = enumerateDays(start, end)
      .filter((date) => !isWeekendDate(date) && !!getBavariaHolidayName(date))
      .filter((date) => !occupiedTimeEntryDates.has(getDateKey(date)))
      .map((date) =>
        buildAbsenceRow(
          date,
          'holiday',
          'holiday',
          'Feiertag',
          `Gesetzlicher Feiertag: ${getBavariaHolidayName(date)}`
        )
      )

    const blockedDates = new Set([
      ...occupiedTimeEntryDates,
      // Auch bestempelte Feiertage sperren Urlaub/Krankheit für diesen Tag.
      ...enumerateDays(start, end)
        .filter((date) => !!getBavariaHolidayName(date))
        .map((date) => getDateKey(date))
    ])

    const vacationEntries: ReportEntry[] = getApprovedLeaveDates(
      leaveRequests,
      'vacation',
      start,
      end,
      blockedDates
    ).map(({ date, request }) => {
      const reason = (request.reason || '').trim()
      return buildAbsenceRow(
        date,
        'vacation',
        `vacation-${request.id || ''}`,
        'Urlaub',
        reason ? `Genehmigter Urlaub: ${reason}` : 'Genehmigter Urlaub'
      )
    })

    const vacationDates = new Set(vacationEntries.map((entry) => entry.dateKey))
    const sickEntries: ReportEntry[] = getApprovedLeaveDates(
      leaveRequests,
      'sick',
      start,
      end,
      new Set([...blockedDates, ...vacationDates])
    ).map(({ date, request }) => {
      const reason = (request.reason || '').trim()
      return buildAbsenceRow(
        date,
        'sick',
        `sick-${request.id || ''}`,
        'Krankheit',
        reason ? `Krankheitstag: ${reason}` : 'Krankheitstag'
      )
    })

    // Berufsschule: bei Azubis soll auf dem Nachweis stehen, warum an dem Tag
    // nicht gearbeitet wurde (Wunsch der Lohnbuchhaltung).
    const sickDates = new Set(sickEntries.map((entry) => entry.dateKey))
    const schoolEntries: ReportEntry[] = getApprovedLeaveDates(
      leaveRequests,
      'school',
      start,
      end,
      new Set([...blockedDates, ...vacationDates, ...sickDates])
    ).map(({ date, request }) => {
      const reason = (request.reason || '').trim()
      return buildAbsenceRow(
        date,
        'school',
        `school-${request.id || ''}`,
        'Berufsschule',
        reason ? `Berufsschule: ${reason}` : 'Berufsschule'
      )
    })

    return [
      ...entries,
      ...holidayEntries,
      ...vacationEntries,
      ...sickEntries,
      ...schoolEntries
    ].sort((a, b) => {
      const ta = a.dateRaw?.getTime() || 0
      const tb = b.dateRaw?.getTime() || 0
      if (ta !== tb) return ta - tb
      if (a.source !== b.source) return a.source === 'time-entry' ? -1 : 1
      return a.id.localeCompare(b.id)
    })
  }

  /**
   * Lädt den Bericht eines Mitarbeiters in die Ansicht.
   *
   * @param range optionaler Zeitraum, der die Datumsfelder überschreibt. Nötig,
   *   weil State-Änderungen erst beim nächsten Rendern greifen – ein direkt
   *   nach setStartDate ausgelöster Suchlauf liefe sonst auf den alten Daten.
   * @param employeeIdOverride dasselbe für den Mitarbeiter: beim Durchblättern
   *   im Sammellauf steht der nächste Mitarbeiter noch nicht im State.
   * @param options.applyReportedHours gemeldete Stunden gleich übernehmen
   *   (Sammellauf). In der Einzelansicht entscheidet das weiterhin der Klick
   *   auf „Übernehmen".
   */
  const handleEmployeeSearch = async (
    range?: { start: string; end: string },
    employeeIdOverride?: string,
    options?: { applyReportedHours?: boolean }
  ) => {
    const employeeId = employeeIdOverride || selectedEmployeeId
    if (!employeeId) {
      toast.error('Bitte wählen Sie einen Mitarbeiter aus')
      return
    }
    const von = range?.start ?? startDate
    const bis = range?.end ?? endDate
    if (!von || !bis) {
      toast.error('Bitte wählen Sie einen Zeitraum aus')
      return
    }

    setIsLoading(true)
    setHasSearched(true)
    // Eine übernommene Meldung gilt immer nur für den geladenen Zeitraum.
    setAppliedSettlementTarget(null)

    try {
      setReportEntries(await loadReportEntriesFor(employeeId, von, bis))
      setSelectedEmployeeName(employeeDisplayName(employeeId))

      const settlement = await DataService.getTimeReportSettlement(employeeId, von, bis)
      setEmployeeSettlement(settlement)

      // Alle Meldungen des Mitarbeiters laden, nicht nur die des gewählten
      // Zeitraums: Der Bericht startet im laufenden Monat, gemeldet wird aber
      // der Vormonat. Ohne die übrigen Meldungen bliebe der Hinweis unsichtbar.
      // In der Einzelansicht wird nichts automatisch angewendet – das
      // entscheidet die Lohnbuchhaltung mit „Übernehmen".
      const settlements = await DataService.getOvertimeSettlements(employeeId)
      setEmployeeSettlements(settlements)

      if (options?.applyReportedHours) {
        const monat = monthKeyForPeriod(von, bis)
        const meldung = monat ? settlements.find(entry => entry.month === monat) : null
        setAppliedSettlementTarget(meldung ? meldung.minutes : null)
      }
    } catch (error) {
      console.error('Fehler:', error)
      toast.error('Fehler beim Laden der Zeiteinträge')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldChange = (index: number, field: keyof ReportEntry, value: string | number) => {
    setReportEntries(prev => {
      const updated = [...prev]
      const entry = { ...updated[index] }
      if (entry.isReadOnly) return prev
      if (field === 'clockIn') entry.clockIn = value as string
      else if (field === 'clockOut') entry.clockOut = value as string
      else if (field === 'pauseMinutes') entry.pauseMinutes = Number(value) || 0
      else if (field === 'projectName') entry.projectName = value as string
      else if (field === 'projectId') {
        entry.projectId = value as string
        entry.projectName = getProjectName(value as string)
      }
      entry.workHours = calculateWorkHours(
        entry.clockIn,
        entry.clockOut,
        entry.pauseMinutes,
        entryCreditMinutes(entry.originalEntry)
      )
      entry.isEdited = true
      updated[index] = entry
      return updated
    })
  }

  // ---------- Direkt-Speicherung der Zeilen in die Datenbank ----------

  const updateDirectSave = (enabled: boolean) => {
    setDirectSave(enabled)
    try {
      localStorage.setItem(DIRECT_SAVE_STORAGE_KEY, enabled ? 'on' : 'off')
    } catch {
      /* localStorage ist optional */
    }
  }

  useEffect(() => {
    const timeouts = savedFlashTimeoutsRef.current
    return () => {
      timeouts.forEach(id => window.clearTimeout(id))
      timeouts.clear()
    }
  }, [])

  const markEntrySaved = (entryId: string) => {
    setSavedEntryIds(prev => new Set(prev).add(entryId))
    const timeouts = savedFlashTimeoutsRef.current
    const existing = timeouts.get(entryId)
    if (existing) window.clearTimeout(existing)
    timeouts.set(
      entryId,
      window.setTimeout(() => {
        timeouts.delete(entryId)
        setSavedEntryIds(prev => {
          const next = new Set(prev)
          next.delete(entryId)
          return next
        })
      }, 2500)
    )
  }

  const setEntrySaving = (entryId: string, saving: boolean) => {
    if (saving) savingGuardRef.current.add(entryId)
    else savingGuardRef.current.delete(entryId)
    setSavingEntryIds(prev => {
      const next = new Set(prev)
      if (saving) next.add(entryId)
      else next.delete(entryId)
      return next
    })
  }

  /** Welche Felder der Zeile weichen vom gespeicherten Stempelsatz ab? */
  const getRowChanges = (entry: ReportEntry) => getReportRowChanges(entry, roundTimeToStep)

  const rowHasPersistableChange = (entry: ReportEntry): boolean => {
    if (entry.isReadOnly || entry.source !== 'time-entry') return false
    return getRowChanges(entry).any
  }

  /**
   * Schreibt die Änderungen einer Berichtszeile direkt in die Datenbank
   * (Projektwechsel inkl. Umzug von Fotos/Fahrzeugen, Kommen/Gehen/Pause).
   */
  const persistRow = async (entry: ReportEntry, options?: { silent?: boolean }): Promise<boolean> => {
    if (!entry) return false
    if (savingGuardRef.current.has(entry.id)) return false
    if (entry.isReadOnly || entry.source !== 'time-entry') {
      if (!options?.silent) toast.error('Urlaubstage können hier nicht gespeichert werden.')
      return false
    }
    if (!rowHasPersistableChange(entry)) return false

    const changes = getRowChanges(entry)
    const baseDate = entry.dateRaw || convertToDate(entry.originalEntry.clockInTime)
    if (!baseDate) {
      if (!options?.silent) toast.error('Der Tag des Stempelsatzes konnte nicht ermittelt werden.')
      return false
    }

    if (changes.clockIn && !entry.clockIn) {
      if (!options?.silent) toast.error('Die Kommen-Zeit darf nicht leer sein.')
      return false
    }
    if (changes.clockOut && !entry.clockOut && changes.originalClockOut) {
      if (!options?.silent) {
        toast.error('Die Gehen-Zeit darf nicht geleert werden. Bitte Zeile löschen, wenn der Satz weg soll.')
      }
      return false
    }

    const clockInDate = changes.clockIn ? buildDateFromTimeInput(baseDate, entry.clockIn) : undefined
    let clockOutDate: Date | null | undefined
    if (changes.clockOut && entry.clockOut) {
      clockOutDate = buildDateFromTimeInput(baseDate, entry.clockOut)
      const reference = clockInDate || convertToDate(entry.originalEntry.clockInTime)
      // Über Mitternacht gearbeitet: Gehen liegt am Folgetag.
      if (clockOutDate && reference && clockOutDate.getTime() <= reference.getTime()) {
        clockOutDate.setDate(clockOutDate.getDate() + 1)
      }
    }

    setEntrySaving(entry.id, true)
    try {
      const admin = await DataService.getCurrentAdmin()
      const saved = await DataService.applyAdminTimeEntryCorrection({
        timeEntryId: entry.id,
        ...(changes.project ? { projectId: entry.projectId } : {}),
        ...(clockInDate ? { clockInTime: clockInDate } : {}),
        ...(clockOutDate !== undefined ? { clockOutTime: clockOutDate } : {}),
        ...(changes.pause ? { pauseTotalTimeMs: Math.max(0, entry.pauseMinutes) * 60 * 1000 } : {}),
        correctedBy: { id: admin?.id, name: admin?.name }
      })

      if (saved) {
        // Zeile auf den frisch gespeicherten Stand ziehen, damit Rohzeit und
        // korrigierte Zeit wieder übereinstimmen.
        setReportEntries(prev =>
          prev.map(row => {
            if (row.id !== entry.id) return row
            const newClockIn = formatTimeForInput(roundTimeToStep(convertToDate(saved.clockInTime)))
            const newClockOut = formatTimeForInput(roundTimeToStep(convertToDate(saved.clockOutTime)))
            const pauseMs = saved.pauseTotalTime || 0
            const pauseMinutes = msToMinutes(pauseMs)
            return {
              ...row,
              originalEntry: saved,
              projectId: saved.projectId,
              projectName:
                saved.customerId && !saved.projectId
                  ? `Kleinauftrag: ${saved.customerName || 'Kunde'}`
                  : getProjectName(saved.projectId),
              clockIn: newClockIn,
              clockOut: newClockOut,
              pauseMinutes,
              pauseMs,
              workHours: calculateWorkHours(
                newClockIn,
                newClockOut,
                pauseMinutes,
                entryCreditMinutes(saved)
              ),
              isEdited: false
            }
          })
        )
      }
      markEntrySaved(entry.id)
      if (!options?.silent) toast.success('Stempelsatz gespeichert.')
      return true
    } catch (error: any) {
      toast.error(error?.message || 'Speichern fehlgeschlagen.')
      return false
    } finally {
      setEntrySaving(entry.id, false)
    }
  }

  /** Alle geänderten Zeilen nacheinander in die Datenbank schreiben. */
  const handleSaveAllRows = async () => {
    const pending = reportEntries.filter(rowHasPersistableChange)
    if (pending.length === 0) {
      toast.error('Keine Zeilenänderungen zum Speichern.')
      return
    }
    let ok = 0
    for (const row of pending) {
      // Sequenziell, damit Projekt-Umzüge (Dateien/Fahrzeuge) nicht kollidieren.
      // eslint-disable-next-line no-await-in-loop
      if (await persistRow(row, { silent: true })) ok += 1
    }
    if (ok > 0) {
      toast.success(
        ok === 1 ? '1 Stempelsatz gespeichert.' : `${ok} Stempelsätze gespeichert.`
      )
    }
  }

  /** Stempelsatz endgültig aus der Datenbank löschen. */
  const handleDeleteRow = async (entryId: string) => {
    const entry = reportEntries.find(e => e.id === entryId)
    if (!entry || entry.source !== 'time-entry') return
    const confirmed = window.confirm(
      `Stempelsatz vom ${entry.date} (${entry.projectName}) wirklich löschen?\n\n` +
        'Der Eintrag wird endgültig aus der Datenbank entfernt.'
    )
    if (!confirmed) return

    setEntrySaving(entry.id, true)
    try {
      await DataService.deleteTimeEntry(entry.id)
      setReportEntries(prev => prev.filter(row => row.id !== entry.id))
      toast.success('Stempelsatz gelöscht.')
    } catch (error: any) {
      toast.error(error?.message || 'Löschen fehlgeschlagen.')
    } finally {
      setEntrySaving(entry.id, false)
    }
  }

  /** Nach dem Verlassen eines Feldes direkt speichern (wenn Direktmodus aktiv). */
  const handleRowBlur = (entry: ReportEntry) => {
    if (!directSave) return
    if (!entry.isEdited || !rowHasPersistableChange(entry)) return
    void persistRow(entry, { silent: true })
  }

  const handleResetEntry = (index: number) => {
    setReportEntries(prev => {
      const updated = [...prev]
      const original = prev[index].originalEntry
      const clockInDate = convertToDate(original.clockInTime)
      const clockOutDate = convertToDate(original.clockOutTime)
      const clockIn = formatTimeForInput(roundTimeToStep(clockInDate))
      const clockOut = formatTimeForInput(roundTimeToStep(clockOutDate))
      const pauseMs = original.pauseTotalTime || 0
      const pauseMinutes = msToMinutes(pauseMs)
      updated[index] = {
        ...updated[index],
        projectId: original.projectId,
        projectName:
          original.customerId && !original.projectId
            ? `Kleinauftrag: ${original.customerName || 'Kunde'}`
            : getProjectName(original.projectId),
        clockIn, clockOut, pauseMinutes, pauseMs,
        notes: updated[index].originalNotes,
        workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes, entryCreditMinutes(original)),
        isEdited: false
      }
      return updated
    })
  }

  // ---------- Gesetzliche Korrektur & Überstunden (reine Anzeige) ----------

  const selectedEmployeeRecord = employees.find(e => e.id === selectedEmployeeId)
  const employeeHourlyRate =
    selectedEmployeeRecord?.hourlyWage || selectedEmployeeRecord?.hourlyRate || 0
  /** Azubis werden pauschal vergütet – im Bericht steht dann kein Stundensatz. */
  const employeeIsApprentice = selectedEmployeeRecord?.isApprentice === true
  const employeeFixedSalary = selectedEmployeeRecord?.fixedMonthlySalary || 0
  const employeeOvertimeBalance =
    typeof selectedEmployeeRecord?.overtimeBalanceMinutes === 'number'
      ? selectedEmployeeRecord.overtimeBalanceMinutes
      : null

  /**
   * Abgeleitete Sicht auf die Berichtszeilen: gesetzliche Pausen, 10-Std-Grenze
   * und – falls aktiv – Regelarbeitszeit samt ausbezahlter Überstunden.
   * Bewusst abgeleitet statt im State gehalten, damit sie bei jeder manuellen
   * Zeilenänderung automatisch neu greift und nie in die Speicherlogik gerät.
   */
  const adjustedReport = useMemo(
    () => {
      const gemeinsam = {
        hourlyRate: employeeHourlyRate,
        mealAllowanceRate,
        isApprentice: employeeIsApprentice,
        fixedMonthlySalary: employeeFixedSalary,
        overtimeBalanceMinutes: employeeOvertimeBalance
      }

      // Übernommene Meldung schlägt die manuelle Regelarbeitszeit-Sicht: die
      // Zeilen werden so gedeckelt bzw. aufgefüllt, dass die Summe die
      // gemeldete Stundenzahl exakt trifft.
      if (appliedSettlementTarget !== null) {
        return buildAdjustedReportForTarget(reportEntries, gemeinsam, appliedSettlementTarget)
      }

      return buildAdjustedReport(reportEntries, {
        ...gemeinsam,
        regularDayMinutes: overtimeMode
          ? (dateKey: string) => regularMinutesForDateKey(dateKey, regularWorkTimeConfig)
          : null,
        requestedPayoutMinutes: overtimeMode ? appliedPayoutMinutes : 0
      })
    },
    [
      reportEntries,
      overtimeMode,
      regularWorkTimeConfig.monThu,
      regularWorkTimeConfig.fri,
      appliedPayoutMinutes,
      appliedSettlementTarget,
      employeeHourlyRate,
      mealAllowanceRate,
      employeeIsApprentice,
      employeeFixedSalary,
      employeeOvertimeBalance
    ]
  )

  /**
   * Deckt der Zeitraum genau einen vollen Kalendermonat ab? Nur dann passt ein
   * monatlicher Fixlohn ungekürzt auf den Beleg. Bewusst über die Datums-
   * Strings gerechnet – `new Date('2026-03-01')` wäre UTC und könnte in
   * unserer Zeitzone auf den 29.02. rutschen.
   */
  const isFullCalendarMonth = (() => {
    const [sy, sm, sd] = (startDate || '').split('-').map(Number)
    const [ey, em, ed] = (endDate || '').split('-').map(Number)
    if (!sy || !sm || !sd || !ey || !em || !ed) return false
    if (sy !== ey || sm !== em) return false
    const lastDayOfMonth = new Date(ey, em, 0).getDate()
    return sd === 1 && ed === lastDayOfMonth
  })()

  /** Meldung, die zum aktuell gewählten Zeitraum gehört (nur bei ganzem Monat). */
  const periodMonthKey = monthKeyForPeriod(startDate, endDate)
  const overtimeSettlement =
    employeeSettlements.find(entry => entry.month === periodMonthKey) ?? null
  /**
   * Meldungen anderer Monate. Der Bericht steht standardmäßig im laufenden
   * Monat, gemeldet wird aber der Vormonat – ohne diesen Hinweis würde die
   * Meldung schlicht übersehen.
   */
  const otherSettlements = employeeSettlements.filter(entry => entry.month !== periodMonthKey)

  const adjustedEntries = adjustedReport.entries
  const regularWorkTimeLabel = `Mo–Do ${minutesToHoursLabel(regularWorkTimeConfig.monThu)} · Fr ${minutesToHoursLabel(regularWorkTimeConfig.fri)}`

  /** Klartext für Tooltip/Hinweis, warum eine Zeile im Bericht abweicht. */
  const describeAdjustments = (entry: AdjustedReportEntry): string => {
    const reasons: string[] = []
    if (entry.workTimeAdjustments.includes('break')) {
      reasons.push(`Pause auf gesetzliche ${entry.effectivePauseMinutes} Min angehoben`)
    }
    if (entry.workTimeAdjustments.includes('max-hours')) {
      reasons.push('auf 10 Std Tageshöchstarbeitszeit gedeckelt')
    }
    if (entry.workTimeAdjustments.includes('regular-cap')) {
      reasons.push('auf die Regelarbeitszeit gedeckelt, Rest bleibt im Überstundenkonto')
    }
    if (entry.workTimeAdjustments.includes('overtime-payout')) {
      reasons.push('ausbezahlte Überstunden aufgeschlagen')
    }
    if (reasons.length === 0) return ''
    return `Nur im Bericht: ${reasons.join(' · ')}. Der Stempelsatz bleibt unverändert.`
  }
  /** Vom Bericht automatisch abgezogene Minuten (Pause + 10-Std-Grenze). */
  const legalCorrectionMinutes =
    adjustedReport.stampedTotalMinutes - adjustedReport.legalTotalMinutes

  const overtimeBalanceMinutes = employeeOvertimeBalance

  const handleApplyPayout = () => {
    const requested = parseHoursMinutesInput(payoutInput)
    if (requested == null) {
      toast.error('Bitte die Überstunden als Stunden:Minuten angeben, z. B. 2:30')
      return
    }
    setAppliedPayoutMinutes(requested)
    if (requested === 0) {
      toast.info('Auszahlung zurückgesetzt – der Bericht zeigt wieder die Regelarbeitszeit.')
      return
    }
    const preview = buildAdjustedReport(reportEntries, {
      regularDayMinutes: (dateKey: string) => regularMinutesForDateKey(dateKey, regularWorkTimeConfig),
      requestedPayoutMinutes: requested
    })
    if (preview.payoutUnallocatedMinutes > 0) {
      toast.error(
        `Nur ${minutesToHoursLabel(preview.payoutMinutes)} konnten verteilt werden – ` +
          `${minutesToHoursLabel(preview.payoutUnallocatedMinutes)} passen nicht mehr in den Zeitraum ` +
          '(10-Std-Grenze je Tag).'
      )
      return
    }
    toast.success(`${minutesToHoursLabel(preview.payoutMinutes)} auf die Zeilen verteilt.`)
  }

  /**
   * Gesamtzeit unter der Tabelle – in Dezimalstunden wie auf dem Beleg. Die
   * Vorschau muss zeigen, was die Lohnbuchhaltung bekommt.
   */
  const calculateTotalHours = (): string => minutesToDecimalHours(adjustedReport.shownTotalMinutes)

  const buildSettlementLinesFromEntries = () =>
    reportEntries.map(re => {
      const creditMinutes = entryCreditMinutes(re.originalEntry)
      const rawMinutes = workMinutesFromOriginalEntry(re.originalEntry)
      const correctedMinutes =
        workMinutesFromParts(re.clockIn, re.clockOut, re.pauseMinutes) + creditMinutes
      const paidOutMinutes = Math.max(0, rawMinutes - correctedMinutes)
      return {
        timeEntryId: re.id,
        dateLabel: re.date,
        rawMinutes,
        correctedMinutes,
        paidOutMinutes
      }
    })

  const getRemainderLines = () => {
    if (employeeSettlement?.lines?.length) {
      return employeeSettlement.lines.filter(l => l.paidOutMinutes > 0)
    }
    return buildSettlementLinesFromEntries().filter(l => l.paidOutMinutes > 0)
  }

  const handleSaveTimeSettlement = async () => {
    if (!selectedEmployeeId || !startDate || !endDate) {
      toast.error('Zeitraum und Mitarbeiter erforderlich')
      return
    }
    if (reportEntries.length === 0) {
      toast.error('Keine Einträge zum Speichern')
      return
    }
    // Im Überstunden-Modus wird nicht die Kürzung abgerechnet, sondern genau
    // der Betrag, den der Admin zur Auszahlung eingetragen hat. Die
    // gesetzliche Pausen-/10-Std-Korrektur bleibt bewusst außen vor — sonst
    // würden die Mitarbeiter genau die Stunden verlieren, die ihnen erhalten
    // bleiben sollen.
    const withoutPayout = overtimeMode
      ? buildAdjustedReport(reportEntries, {
          regularDayMinutes: (dateKey: string) =>
            regularMinutesForDateKey(dateKey, regularWorkTimeConfig),
          requestedPayoutMinutes: 0
        })
      : null

    const lines = overtimeMode
      ? adjustedEntries.map((entry, index) => ({
          timeEntryId: entry.id,
          dateLabel: entry.date,
          rawMinutes: workMinutesFromOriginalEntry(entry.originalEntry),
          correctedMinutes: entry.effectiveWorkMinutes,
          paidOutMinutes: Math.max(
            0,
            entry.effectiveWorkMinutes -
              (withoutPayout?.entries[index]?.effectiveWorkMinutes ?? entry.effectiveWorkMinutes)
          )
        }))
      : buildSettlementLinesFromEntries()

    const rawTotalMinutes = overtimeMode
      ? adjustedReport.legalTotalMinutes
      : lines.reduce((s, l) => s + l.rawMinutes, 0)
    const correctedTotalMinutes = overtimeMode
      ? adjustedReport.shownTotalMinutes
      : lines.reduce((s, l) => s + l.correctedMinutes, 0)
    const paidOutMinutes = overtimeMode
      ? adjustedReport.payoutMinutes
      : lines.reduce((s, l) => s + l.paidOutMinutes, 0)

    setIsSavingSettlement(true)
    try {
      // Liegt eine Meldung des Mitarbeiters vor, hat sie das Überstundenkonto
      // bereits vollständig bewegt (nicht abgerechnete Stunden gutgeschrieben
      // bzw. ausgezahlte abgezogen). Dann darf hier gar nichts mehr gebucht
      // werden – deshalb gilt der volle Betrag als bereits gebucht.
      const alreadyBookedMinutes = overtimeSettlement ? paidOutMinutes : 0
      await DataService.saveTimeReportSettlement(
        {
          employeeId: selectedEmployeeId,
          periodStart: startDate,
          periodEnd: endDate,
          paidOutMinutes,
          rawTotalMinutes,
          correctedTotalMinutes,
          lines
        },
        { alreadyBookedMinutes }
      )
      const newlyBookedMinutes = Math.max(0, paidOutMinutes - alreadyBookedMinutes)
      toast.success(
        overtimeMode
          ? paidOutMinutes > 0
            ? newlyBookedMinutes > 0
              ? `Abrechnung gespeichert. ${minutesToHoursLabel(newlyBookedMinutes)} Überstunden wurden vom Konto abgezogen.`
              : `Abrechnung gespeichert. Die ${minutesToHoursLabel(paidOutMinutes)} Überstunden hatte der Mitarbeiter bereits selbst verrechnet – das Konto bleibt unverändert.`
            : 'Abrechnung gespeichert (keine Überstunden zur Auszahlung eingetragen).'
          : paidOutMinutes > 0
            ? 'Abrechnung gespeichert. Differenz wurde als ausbezahlte/gekürzte Zeit erfasst.'
            : 'Abrechnung gespeichert (keine positive Differenz zur Rohzeit).'
      )
      const settlement = await DataService.getTimeReportSettlement(
        selectedEmployeeId,
        startDate,
        endDate
      )
      setEmployeeSettlement(settlement)
      await loadInitialData()
    } catch (error: any) {
      toast.error(error?.message || 'Speichern fehlgeschlagen')
    } finally {
      setIsSavingSettlement(false)
    }
  }

  interface ProjectDayBlock {
    dateKey: string
    dateLabel: string
    totalHours: number
    byEmployee: { employeeId: string; name: string; hours: number }[]
    entries: TimeEntry[]
  }

  const getEmployeeDisplayName = (employeeId: string): string => {
    const employee = allEmployees.find(e => e.id === employeeId)
    return (
      employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employeeId
    )
  }

  const buildProjectDayBlocks = (): ProjectDayBlock[] => {
    const dayMap = new Map<
      string,
      {
        entries: TimeEntry[]
        empHours: Map<string, number>
      }
    >()

    for (const entry of projectRawEntries) {
      if (!entry.clockOutTime) continue
      const clockIn = convertToDate(entry.clockInTime)
      const clockOut = convertToDate(entry.clockOutTime)
      if (!clockIn || !clockOut) continue
      const dateKey = formatDateForInputLocal(clockIn)
      let bucket = dayMap.get(dateKey)
      if (!bucket) {
        bucket = { entries: [], empHours: new Map() }
        dayMap.set(dateKey, bucket)
      }
      bucket.entries.push(entry)
      // Stunden aus den geglätteten Zeiten berechnen (nur für diesen Bericht)
      const rIn = roundTimeToStep(clockIn) || clockIn
      const rOut = roundTimeToStep(clockOut) || clockOut
      const diffMs = rOut.getTime() - rIn.getTime()
      const pauseMs = entry.pauseTotalTime || 0
      const workMs = Math.max(0, diffMs - pauseMs) + getReturnTravelCreditMs(entry)
      const hours = workMs / (1000 * 60 * 60)
      const prev = bucket.empHours.get(entry.employeeId) || 0
      bucket.empHours.set(entry.employeeId, prev + hours)
    }

    for (const f of [...projectPhotos, ...projectDocuments]) {
      const d = convertToDate(f.uploadTime)
      if (!d) continue
      const dateKey = formatDateForInputLocal(d)
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, { entries: [], empHours: new Map() })
      }
    }

    const keys = [...dayMap.keys()].sort()
    return keys.map(dateKey => {
      const bucket = dayMap.get(dateKey)!
      const sortedEntries = [...bucket.entries].sort((a, b) => {
        const ta = convertToDate(a.clockInTime)?.getTime() || 0
        const tb = convertToDate(b.clockInTime)?.getTime() || 0
        return ta - tb
      })
      let totalHours = 0
      bucket.empHours.forEach(h => {
        totalHours += h
      })
      const byEmployee = [...bucket.empHours.entries()]
        .map(([employeeId, hours]) => ({
          employeeId,
          name: getEmployeeDisplayName(employeeId),
          hours: Math.round(hours * 100) / 100
        }))
        .sort((a, b) => b.hours - a.hours)

      const labelDate = new Date(dateKey + 'T12:00:00')
      const dateLabel = labelDate.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })

      return {
        dateKey,
        dateLabel,
        totalHours: Math.round(totalHours * 100) / 100,
        byEmployee,
        entries: sortedEntries
      }
    })
  }

  const filesForProjectDay = (dateKey: string): { photos: FileUpload[]; docs: FileUpload[] } => {
    const entryDateById = new Map<string, string>()
    for (const entry of projectRawEntries) {
      const clockIn = convertToDate(entry.clockInTime)
      if (clockIn) {
        entryDateById.set(entry.id, formatDateForInputLocal(clockIn))
      }
    }
    const pred = (f: FileUpload) => {
      if (f.timeEntryId && entryDateById.has(f.timeEntryId)) {
        return entryDateById.get(f.timeEntryId) === dateKey
      }
      const d = convertToDate(f.uploadTime)
      if (!d) return false
      return formatDateForInputLocal(d) === dateKey
    }
    return {
      photos: projectPhotos.filter(pred),
      docs: projectDocuments.filter(pred)
    }
  }

  const toggleProjectDayExpanded = (dateKey: string) => {
    setExpandedProjectDays(prev => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  const handleProjectStaffPrint = () => {
    if (projectRawEntries.length === 0) {
      toast.error('Keine Buchungen zum Drucken')
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Popup blockiert.')
      return
    }

    const period =
      useTimeFilter && startDate && endDate
        ? `${new Date(startDate).toLocaleDateString('de-DE')} – ${new Date(endDate).toLocaleDateString('de-DE')}`
        : 'Gesamte Projektlaufzeit'

    const html = buildProjectStaffPrintHtml({
      entries: projectRawEntries,
      projectName: selectedProject?.name || '',
      periodLabel: period,
      getEmployeeDisplayName
    })

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus()
        printWindow.print()
      }, 80)
    }
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 350)
  }

  // ==================== PROJEKT-BERICHT ====================
  const handleProjectSearch = async () => {
    if (!selectedProjectId) {
      toast.error('Bitte wählen Sie ein Projekt aus')
      return
    }

    setIsLoading(true)
    setHasSearched(true)

    try {
      const project = projects.find(p => p.id === selectedProjectId)
      setSelectedProject(project || null)

      // Zeiteinträge laden (bei aktivem Zeitfilter serverseitig vorgefiltert;
      // der Filter unten bleibt als Absicherung, die Query darf eine Obermenge liefern)
      const applyTimeFilter = useTimeFilter && !!startDate && !!endDate
      const rangeStart = applyTimeFilter ? new Date(startDate) : null
      if (rangeStart) rangeStart.setHours(0, 0, 0, 0)
      const rangeEnd = applyTimeFilter ? new Date(endDate) : null
      if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999)

      let timeEntries = await DataService.getTimeEntriesByProject(
        selectedProjectId,
        rangeStart && rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined
      )

      // Optional nach Zeitraum filtern
      if (rangeStart && rangeEnd) {
        const start = rangeStart
        const end = rangeEnd

        timeEntries = timeEntries.filter(entry => {
          const entryDate = convertToDate(entry.clockInTime)
          if (!entryDate) return false
          return entryDate >= start && entryDate <= end
        })
      }

      // Nach Mitarbeiter gruppieren und summieren
      const employeeMap = new Map<
        string,
        { hours: number; rate: number; costRate: number; hasCostRate: boolean; name: string }
      >()

      timeEntries.forEach(entry => {
        if (!entry.clockOutTime) return // Nur abgeschlossene Einträge

        const clockIn = convertToDate(entry.clockInTime)
        const clockOut = convertToDate(entry.clockOutTime)
        if (!clockIn || !clockOut) return

        // Zeiten auf 15-Min-Raster glätten (einheitliche Basis für Kosten)
        const diffMs = roundTimeToStep(clockOut).getTime() - roundTimeToStep(clockIn).getTime()
        const pauseMs = entry.pauseTotalTime || 0
        const workMs = diffMs - pauseMs + getReturnTravelCreditMs(entry)
        const hours = workMs / (1000 * 60 * 60)

        const employee = allEmployees.find(e => e.id === entry.employeeId)
        const hourlyRate = employee?.hourlyWage || employee?.hourlyRate || 0
        const hasCostRate = typeof employee?.hourlyCostRate === 'number' && employee.hourlyCostRate > 0
        const costRate = hasCostRate ? (employee!.hourlyCostRate as number) : 0
        const employeeName = employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || entry.employeeId

        const existing = employeeMap.get(entry.employeeId)
        if (existing) {
          existing.hours += hours
        } else {
          employeeMap.set(entry.employeeId, { hours, rate: hourlyRate, costRate, hasCostRate, name: employeeName })
        }
      })

      const empSummaries: EmployeeSummary[] = Array.from(employeeMap.entries()).map(([id, data]) => ({
        employeeId: id,
        employeeName: data.name,
        totalHours: Math.round(data.hours * 100) / 100,
        hourlyRate: data.rate,
        totalCost: Math.round(data.hours * data.rate * 100) / 100,
        hourlyCostRate: data.costRate,
        totalPurchaseCost: Math.round(data.hours * data.costRate * 100) / 100,
        hasCostRate: data.hasCostRate
      }))
      empSummaries.sort((a, b) => b.totalCost - a.totalCost)
      setEmployeeSummaries(empSummaries)

      setProjectRawEntries(timeEntries)

      // Vom Admin nachgetragenes Material / Gutschriften laden
      try {
        const credits = await DataService.getMaterialCreditsByProject(selectedProjectId)
        setProjectMaterialCredits(credits)
      } catch (e) {
        console.log('Keine Material-Buchungen gefunden')
        setProjectMaterialCredits([])
      }

      // Fotos und Dokumente laden
      try {
        const [photos, docs] = await Promise.all([
          DataService.getProjectFiles(selectedProjectId, 'construction_site', {
            includeBinary: true
          }),
          DataService.getProjectFiles(selectedProjectId, 'document', { includeBinary: true })
        ])
        
        // Nach Datum sortieren
        const sortByDate = (a: FileUpload, b: FileUpload) => {
          const dateA = convertToDate(a.uploadTime)
          const dateB = convertToDate(b.uploadTime)
          if (!dateA || !dateB) return 0
          return dateB.getTime() - dateA.getTime()
        }
        
        setProjectPhotos(photos.sort(sortByDate))
        setProjectDocuments(docs.sort(sortByDate))
      } catch (e) {
        console.log('Fehler beim Laden der Dateien:', e)
      }

    } catch (error) {
      console.error('Fehler:', error)
      toast.error('Fehler beim Laden der Projektdaten')
    } finally {
      setIsLoading(false)
    }
  }

  const getEmployeeTotalCost = () => employeeSummaries.reduce((sum, e) => sum + e.totalCost, 0)

  // Summe interner Personalkosten (Einkauf) – nur Mitarbeiter mit hinterlegtem Kostensatz
  const getEmployeeTotalPurchaseCost = () =>
    employeeSummaries.reduce((sum, e) => sum + (e.hasCostRate ? e.totalPurchaseCost : 0), 0)

  // Summe Personalmarge = Verrechnung − interner Kostensatz (nur mit hinterlegtem Kostensatz)
  const getEmployeeTotalMargin = () =>
    employeeSummaries.reduce((sum, e) => sum + (e.hasCostRate ? e.totalCost - e.totalPurchaseCost : 0), 0)

  // Mindestens ein Mitarbeiter mit hinterlegtem Kostensatz? (steuert Anzeige der Marge-Spalten)
  const hasAnyEmployeeCostRate = () => employeeSummaries.some((e) => e.hasCostRate)

  // Einkaufspreis pro Einheit aus dem Materialkatalog auflösen (per ID, sonst Name).
  // Nur intern (Admin/Nachkalkulation) – auf dem gebuchten Material selbst ist er nicht gespeichert.
  const resolvePurchaseUnitPrice = (usage: {
    materialTypeId?: string
    materialName?: string
  }): number | undefined => {
    let type: MaterialType | undefined
    if (usage.materialTypeId) {
      type = materialTypes.find((t) => t.id === usage.materialTypeId)
    }
    if (!type && usage.materialName) {
      const n = usage.materialName.trim().toLowerCase()
      type = materialTypes.find((t) => (t.name || '').trim().toLowerCase() === n)
    }
    return typeof type?.purchasePriceEur === 'number' ? type.purchasePriceEur : undefined
  }

  // Gebuchtes Material (beim Ausstempeln erfasst) für die Nachkalkulation aggregieren
  const getProjectMaterialSummaries = () => {
    const map = new Map<
      string,
      {
        key: string
        name: string
        unitLabel: string
        quantity: number
        unitPriceEur?: number
        purchaseUnitEur?: number
        cost: number
        purchaseCost: number
        hasPurchase: boolean
      }
    >()
    const addUsage = (usage: {
      materialTypeId?: string
      materialName?: string
      unitLabel?: string
      quantity?: number
      unitPriceEur?: number
    }) => {
      const key = usage.materialTypeId || usage.materialName || 'unbekannt'
      const qty = Number(usage.quantity) || 0
      const price = typeof usage.unitPriceEur === 'number' ? usage.unitPriceEur : undefined
      const purchaseUnit = resolvePurchaseUnitPrice(usage)
      const cost = price != null ? qty * price : 0
      const purchaseCost = purchaseUnit != null ? qty * purchaseUnit : 0
      const existing = map.get(key)
      if (existing) {
        existing.quantity += qty
        existing.cost += cost
        existing.purchaseCost += purchaseCost
        if (existing.unitPriceEur == null && price != null) existing.unitPriceEur = price
        if (existing.purchaseUnitEur == null && purchaseUnit != null) existing.purchaseUnitEur = purchaseUnit
        if (purchaseUnit != null) existing.hasPurchase = true
      } else {
        map.set(key, {
          key,
          name: usage.materialName || 'Material',
          unitLabel: usage.unitLabel || '',
          quantity: qty,
          unitPriceEur: price,
          purchaseUnitEur: purchaseUnit,
          cost,
          purchaseCost,
          hasPurchase: purchaseUnit != null
        })
      }
    }

    // Von Mitarbeitern beim Ausstempeln erfasstes Material
    for (const entry of projectRawEntries) {
      for (const usage of entry.materialUsages || []) {
        addUsage(usage)
      }
    }
    // Vom Admin nachgetragener Verbrauch
    for (const credit of projectMaterialCredits) {
      if (credit.kind !== 'consumption') continue
      addUsage(credit)
    }
    return Array.from(map.values()).sort(
      (a, b) => b.cost - a.cost || a.name.localeCompare(b.name, 'de')
    )
  }

  const getMaterialTotalCost = () => getProjectMaterialSummaries().reduce((sum, m) => sum + m.cost, 0)

  // Summe Einkauf (nur Positionen mit hinterlegtem Einkaufspreis)
  const getMaterialTotalPurchaseCost = () =>
    getProjectMaterialSummaries().reduce((sum, m) => sum + (m.hasPurchase ? m.purchaseCost : 0), 0)

  // Summe Marge = Verkauf − Einkauf (nur Positionen mit hinterlegtem Einkaufspreis)
  const getMaterialTotalMargin = () =>
    getProjectMaterialSummaries().reduce(
      (sum, m) => sum + (m.hasPurchase ? m.cost - m.purchaseCost : 0),
      0
    )

  const getProjectTotalCost = () => getEmployeeTotalCost() + getMaterialTotalCost()

  const getImageSrc = (file: FileUpload): string => getFileImageSrc(file)

  const handlePrint = () => {
    if (isPrintInProgressRef.current) {
      return
    }

    if (reportType === 'employee') {
      handleEmployeeTablePrint()
      return
    }

    if (!hasSearched) {
      toast.error('Kein Bericht zum Drucken vorhanden')
      return
    }

    isPrintInProgressRef.current = true
    setIsPreparingPrint(true)
    clearPrintResetTimeout()
    toast.info('Druckvorschau wird geöffnet ...')

    // Fallback, falls ein Browser kein afterprint-Event liefert.
    printResetTimeoutRef.current = window.setTimeout(() => {
      resetPrintPreparation()
    }, 15000)

    try {
      window.print()
    } catch (error) {
      console.error('Fehler beim Öffnen der Druckvorschau:', error)
      resetPrintPreparation()
      toast.error('Druckvorschau konnte nicht geöffnet werden')
    }
  }

  const formatPeriod = (): string => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    return `${start.toLocaleDateString('de-DE')} - ${end.toLocaleDateString('de-DE')}`
  }

  const handleEmployeeTablePrint = () => {
    if (reportEntries.length === 0) {
      toast.error('Keine Zeiteinträge zum Drucken vorhanden')
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Popup blockiert. Bitte Popups für diese Seite erlauben.')
      return
    }

    isPrintInProgressRef.current = true
    setIsPreparingPrint(true)
    clearPrintResetTimeout()
    toast.info('Druckansicht wird vorbereitet ...')

    let hasCleanedUp = false
    let hasTriggeredPrint = false

    const cleanup = () => {
      if (hasCleanedUp) return
      hasCleanedUp = true
      resetPrintPreparation()
      window.setTimeout(() => {
        try {
          printWindow.close()
        } catch {
          // no-op
        }
      }, 200)
    }

    printResetTimeoutRef.current = window.setTimeout(() => {
      cleanup()
    }, 20000)

    const triggerPrint = () => {
      if (hasTriggeredPrint) return
      hasTriggeredPrint = true
      try {
        printWindow.focus()
        printWindow.print()
      } catch (error) {
        console.error('Fehler beim Öffnen der Druckvorschau:', error)
        toast.error('Druckvorschau konnte nicht geöffnet werden')
        cleanup()
      }
    }

    try {
      printWindow.document.open()
      printWindow.document.write(buildEmployeePrintHtml(currentEmployeeParams()))
      printWindow.document.close()

      printWindow.addEventListener('afterprint', cleanup, { once: true })
      printWindow.onload = () => {
        window.setTimeout(() => triggerPrint(), 80)
      }

      // Fallback, falls onload/afterprint auf einzelnen Browsern nicht zuverlässig feuert.
      window.setTimeout(() => triggerPrint(), 350)
    } catch (error) {
      console.error('Fehler beim Vorbereiten des Druckdokuments:', error)
      cleanup()
      toast.error('Druckdokument konnte nicht erstellt werden')
    }
  }

  /**
   * Meldung des Mitarbeiters samt „Übernehmen". Identisch in der
   * Mitarbeiter-Zeitauswertung und im DATEV-Nachweis – beide arbeiten auf
   * derselben Meldung und derselben Zielsumme.
   */
  const renderSettlementNote = () => (
    <>
        {/* Meldungen aus anderen Monaten sichtbar machen: der Bericht
            startet im laufenden Monat, gemeldet wird der Vormonat. */}
        {!overtimeSettlement && otherSettlements.length > 0 && (
          <div className="employee-report-note employee-report-note-other no-print">
            <div className="employee-report-note-text">
              <h4>Meldung aus einem anderen Monat</h4>
              <p>
                {selectedEmployeeName || 'Der Mitarbeiter'} hat{' '}
                {otherSettlements.length === 1 ? 'eine Meldung' : 'Meldungen'} abgegeben, die
                nicht zum gewählten Zeitraum passt
                {otherSettlements.length === 1 ? '' : 'en'}:{' '}
                {otherSettlements
                  .slice(0, 3)
                  .map(
                    (entry) =>
                      `${monthKeyLabel(entry.month)} – ${minutesToHoursLabel(entry.minutes)} Std`
                  )
                  .join(' · ')}
              </p>
            </div>
            <div className="employee-report-note-actions">
              {otherSettlements.slice(0, 3).map((entry) => (
                <button
                  key={entry.month}
                  type="button"
                  className="btn secondary-btn"
                  onClick={() => {
                    const range = monthRange(entry.month)
                    if (!range) return
                    // Ein Monatswechsel verlässt den Sammellauf: dessen
                    // Mitarbeiterliste gilt nur für den Zeitraum, zu dem sie
                    // ermittelt wurde.
                    exitBatchMode()
                    setStartDate(range.start)
                    setEndDate(range.end)
                    void handleEmployeeSearch(range)
                  }}
                >
                  {monthKeyLabel(entry.month)} anzeigen
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Meldung des Mitarbeiters: was er für den Monat abgerechnet
            haben möchte. Angewendet wird sie erst auf Klick. */}
        {overtimeSettlement && reportEntries.length > 0 && (
          <div className="employee-report-note no-print">
            <div className="employee-report-note-text">
              <h4>
                Meldung von {selectedEmployeeName || 'dem Mitarbeiter'} für{' '}
                {monthKeyLabel(overtimeSettlement.month)}
              </h4>
              <p>
                Abzurechnen: <strong>{minutesToHoursLabel(overtimeSettlement.minutes)} Std</strong>
                {typeof overtimeSettlement.workedMinutes === 'number' && (
                  <>
                    {' '}von {minutesToHoursLabel(overtimeSettlement.workedMinutes)} Std
                    geleistet
                    {(() => {
                      const diff =
                        overtimeSettlement.workedMinutes - overtimeSettlement.minutes
                      if (diff > 0)
                        return ` – ${minutesToHoursLabel(diff)} Std gehen aufs Überstundenkonto.`
                      if (diff < 0)
                        return ` – ${minutesToHoursLabel(-diff)} Std kommen vom Überstundenkonto.`
                      return ' – nichts bleibt auf dem Überstundenkonto.'
                    })()}
                  </>
                )}
              </p>
              <p className="employee-report-note-state">
                In der Liste stehen aktuell{' '}
                <strong>{minutesToHoursLabel(adjustedReport.summary.workMinutes)} Std</strong>{' '}
                Arbeitszeit
                {adjustedReport.summary.workMinutes === overtimeSettlement.minutes
                  ? ' – die Meldung ist übernommen.'
                  : ' – weicht von der Meldung ab.'}
              </p>
            </div>
            <div className="employee-report-note-actions">
              <button
                type="button"
                className="btn primary-btn"
                onClick={handleApplyReportedHours}
                disabled={appliedSettlementTarget === overtimeSettlement.minutes}
              >
                Übernehmen
              </button>
              {appliedSettlementTarget !== null && (
                <button
                  type="button"
                  className="btn secondary-btn"
                  onClick={handleResetReportedHours}
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>
        )}
    </>
  )

  /** Tageszeilen der DATEV-Vorlage (eine Zeile je Kalendertag). */
  const datevRows = useMemo(
    () => (reportType === 'datev' ? buildDatevRows(adjustedEntries, startDate, endDate) : []),
    [reportType, adjustedEntries, startDate, endDate]
  )

  /** Der DATEV-Nachweis in der aktuell angezeigten Fassung – für Druck und PDF. */
  const currentDatevParams = (): DatevPrintParams => ({
    rows: datevRows,
    employeeName: selectedEmployeeName,
    personnelNumber: selectedEmployeeRecord?.heroEmployeeId || '',
    periodLabel: periodMonthKey ? monthKeyLabel(periodMonthKey) : formatPeriod(),
    summary: adjustedReport.summary
  })

  const buildCurrentDatevHtml = (): string => buildDatevPrintHtml(currentDatevParams())

  const handleDatevPrint = () => {
    if (datevRows.length === 0) {
      toast.error('Kein Nachweis zum Drucken vorhanden')
      return
    }
    // Ohne Fenster-Optionen öffnen: mit "noopener" liefert window.open laut
    // Spezifikation null, das Fenster bliebe als leeres about:blank stehen und
    // es ließe sich nichts hineinschreiben.
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Popup blockiert. Bitte Popups für diese Seite erlauben.')
      return
    }

    let hasTriggeredPrint = false
    const triggerPrint = () => {
      if (hasTriggeredPrint) return
      hasTriggeredPrint = true
      try {
        printWindow.focus()
        printWindow.print()
      } catch (error) {
        console.error('Druckvorschau konnte nicht geöffnet werden:', error)
        toast.error('Druckvorschau konnte nicht geöffnet werden')
      }
    }

    try {
      printWindow.document.open()
      printWindow.document.write(buildCurrentDatevHtml())
      printWindow.document.close()
      printWindow.onload = () => window.setTimeout(triggerPrint, 80)
      // Fallback, falls onload in einzelnen Browsern nicht feuert.
      window.setTimeout(triggerPrint, 350)
    } catch (error) {
      console.error('Druckdokument konnte nicht erstellt werden:', error)
      toast.error('Druckdokument konnte nicht erstellt werden')
    }
  }

  /** Der Bericht in der aktuell angezeigten Fassung – für Druck und PDF. */
  const currentEmployeeParams = (): EmployeePrintParams => ({
    reportEntries: adjustedEntries,
    startDate,
    endDate,
    employeeName: selectedEmployeeName,
    periodLabel: formatPeriod(),
    regularWorkTimeLabel: overtimeMode ? regularWorkTimeLabel : null,
    payoutMinutes: adjustedReport.payoutMinutes,
    summary: adjustedReport.summary
  })

  /**
   * Übernimmt die vom Mitarbeiter gemeldete Stundenzahl in die Zeilen.
   *
   * Die Zeiten werden so gedeckelt bzw. aufgefüllt, dass die ausgewiesene
   * Arbeitszeit die Meldung exakt trifft – nach unten wie nach oben. Verglichen
   * wird nur die Arbeitszeit; Urlaub, Feiertag und Krankheit stehen fest und
   * sind in der Meldung nicht enthalten.
   */
  const handleApplyReportedHours = () => {
    if (!overtimeSettlement) return
    const ziel = overtimeSettlement.minutes

    // Die manuelle Überstunden-Sicht würde sonst mit der Meldung konkurrieren.
    setOvertimeMode(false)
    setPayoutInput('0:00')
    setAppliedPayoutMinutes(0)
    setAppliedSettlementTarget(ziel)
    toast.success(`${minutesToHoursLabel(ziel)} Std in die Zeilen übernommen.`)
  }

  const handleResetReportedHours = () => {
    setAppliedSettlementTarget(null)
    toast.info('Gemeldete Stunden verworfen – es gelten wieder die gestempelten Zeiten.')
  }

  // ---------- Sammellauf: Auswertung für alle Mitarbeiter ----------

  /** Zeitraum-Beschriftung unabhängig von den aktuellen Datumsfeldern. */
  const formatRangeLabel = (range: { start: string; end: string }): string =>
    `${new Date(range.start).toLocaleDateString('de-DE')} - ${new Date(range.end).toLocaleDateString('de-DE')}`

  /** Dateiname eines Berichts-Anhangs: sprechend und im Postfach sortierbar. */
  const reportFilename = (
    prefix: string,
    employeeName: string,
    range: { start: string; end: string }
  ): string => {
    const safeName = (employeeName || 'mitarbeiter')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return `${prefix}-${safeName}-${range.start}_${range.end}.html`
  }

  const exitBatchMode = () => {
    setBatchEmployeeIds([])
    setBatchPeriod(null)
    setBatchIndex(0)
    setBatchSelected(new Set())
  }

  /**
   * Ausgewählte Mitarbeiter in der Reihenfolge der Blätter-Liste. Über diese
   * Liste laufen Sammeldruck und Sammelversand – nicht über batchEmployeeIds.
   */
  const selectedBatchIds = batchEmployeeIds.filter(id => batchSelected.has(id))

  const toggleBatchSelection = (employeeId: string, aktiv: boolean) => {
    setBatchSelected(prev => {
      const next = new Set(prev)
      if (aktiv) next.add(employeeId)
      else next.delete(employeeId)
      return next
    })
  }

  /**
   * Sucht alle Mitarbeiter, die im gewählten Zeitraum gestempelt haben, und
   * öffnet den Bericht des ersten. Durchgeblättert wird danach mit den Pfeilen –
   * jeder Bericht ist die gewohnte Einzelansicht, nur ohne neue Auswahl.
   */
  const handleSearchAllEmployees = async () => {
    if (!startDate || !endDate) {
      toast.error('Bitte wählen Sie einen Zeitraum aus')
      return
    }
    const range = { start: startDate, end: endDate }
    const start = new Date(range.start)
    start.setHours(0, 0, 0, 0)
    const end = new Date(range.end)
    end.setHours(23, 59, 59, 999)

    setIsBatchLoading(true)
    try {
      const kandidaten = employees.map(emp => emp.id).filter((id): id is string => !!id)
      const gestempelt = await Promise.all(
        kandidaten.map(async employeeId => {
          const entries = await DataService.getTimeEntriesByEmployeeId(employeeId, {
            from: start,
            to: end
          })
          // Der Zeitraum wird clientseitig geprüft – die Query darf eine
          // Obermenge liefern (siehe DataService.queryTimeEntries).
          const trifftZeitraum = entries.some(entry => {
            const datum = convertToDate(entry.clockInTime)
            return !!datum && datum >= start && datum <= end
          })
          return trifftZeitraum ? employeeId : null
        })
      )

      const ids = gestempelt
        .filter((id): id is string => !!id)
        .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b), 'de'))

      if (ids.length === 0) {
        exitBatchMode()
        toast.error('Im gewählten Zeitraum hat kein Mitarbeiter gestempelt.')
        return
      }

      setBatchEmployeeIds(ids)
      setBatchIndex(0)
      // Erst einmal ist jeder dabei; abgewählt wird beim Durchblättern.
      setBatchSelected(new Set(ids))
      setBatchPeriod(range)
      setSelectedEmployeeId(ids[0])
      await handleEmployeeSearch(range, ids[0], { applyReportedHours: batchApplyReported })
      toast.success(
        `${ids.length} Mitarbeiter mit Zeiteinträgen – mit den Pfeilen durchblättern.`
      )
    } catch (error) {
      console.error('Sammelauswertung fehlgeschlagen:', error)
      toast.error('Die Auswertung für alle konnte nicht erstellt werden.')
    } finally {
      setIsBatchLoading(false)
    }
  }

  const goToBatchEmployee = async (index: number) => {
    if (!batchPeriod) return
    if (index < 0 || index >= batchEmployeeIds.length) return
    const employeeId = batchEmployeeIds[index]
    setBatchIndex(index)
    setSelectedEmployeeId(employeeId)
    await handleEmployeeSearch(batchPeriod, employeeId, {
      applyReportedHours: batchApplyReported
    })
  }

  /**
   * Baut die Auswertung eines Mitarbeiters ohne den Umweg über die Ansicht –
   * Grundlage des Sammeldrucks. Stundenlohn, Verpflegungssatz und Azubi/Fixlohn
   * kommen wie in der Einzelansicht von der Mitarbeiterkarte.
   */
  const buildBatchReport = async (employeeId: string, range: { start: string; end: string }) => {
    const emp =
      employees.find(e => e.id === employeeId) || allEmployees.find(e => e.id === employeeId)
    const entries = await loadReportEntriesFor(employeeId, range.start, range.end, {
      // Der Bericht liest aus den Dateien nur die Kommentare – die Bilddaten
      // würden den Sammellauf nur unnötig schwer machen.
      includeFileBinaries: false
    })

    const options: BuildAdjustedReportOptions = {
      hourlyRate: emp?.hourlyWage || emp?.hourlyRate || 0,
      mealAllowanceRate:
        typeof emp?.mealAllowanceRate === 'number'
          ? emp.mealAllowanceRate
          : DEFAULT_MEAL_ALLOWANCE_EUR,
      isApprentice: emp?.isApprentice === true,
      fixedMonthlySalary: emp?.fixedMonthlySalary || 0,
      overtimeBalanceMinutes:
        typeof emp?.overtimeBalanceMinutes === 'number' ? emp.overtimeBalanceMinutes : null
    }

    const monat = monthKeyForPeriod(range.start, range.end)
    let ziel: number | null = null
    if (batchApplyReported && monat) {
      const meldungen = await DataService.getOvertimeSettlements(employeeId)
      ziel = meldungen.find(entry => entry.month === monat)?.minutes ?? null
    }

    return {
      employee: emp,
      name: employeeDisplayName(employeeId),
      report:
        ziel !== null
          ? buildAdjustedReportForTarget(entries, options, ziel)
          : buildAdjustedReport(entries, options)
    }
  }

  /**
   * Baut die Druckdaten der ausgewählten Mitarbeiter des Sammellaufs – einmal
   * geladen, genutzt von „Alle drucken" wie von „Alle versenden".
   */
  const collectBatchReports = async (
    range: { start: string; end: string },
    onProgress: (fertig: number) => void
  ) => {
    const periodLabel = formatRangeLabel(range)
    const monat = monthKeyForPeriod(range.start, range.end)
    const monthLabel = monat ? monthKeyLabel(monat) : periodLabel
    const employeeReports: EmployeePrintParams[] = []
    const datevReports: DatevPrintParams[] = []
    let totalMinutes = 0
    let grossWageAmount = 0
    let fertig = 0

    for (const employeeId of selectedBatchIds) {
      // Sequenziell: die Firestore-Abfragen je Mitarbeiter sollen sich nicht
      // gegenseitig ausbremsen, und der Fortschritt bleibt ablesbar.
      const { employee, name, report } = await buildBatchReport(employeeId, range)
      if (reportType === 'datev') {
        const rows = buildDatevRows(report.entries, range.start, range.end)
        datevReports.push({
          rows,
          employeeName: name,
          personnelNumber: employee?.heroEmployeeId || '',
          periodLabel: monthLabel,
          summary: report.summary
        })
        totalMinutes += datevTotalMinutes(rows)
      } else {
        employeeReports.push({
          reportEntries: report.entries,
          startDate: range.start,
          endDate: range.end,
          employeeName: name,
          periodLabel,
          payoutMinutes: report.payoutMinutes,
          summary: report.summary
        })
        totalMinutes += report.shownTotalMinutes
      }
      grossWageAmount += report.summary.grossWageAmount
      fertig += 1
      onProgress(fertig)
    }

    return {
      employeeReports,
      datevReports,
      periodLabel,
      monthLabel,
      totalMinutes,
      grossWageAmount: Math.round(grossWageAmount * 100) / 100
    }
  }

  /** Die ausgewählten Mitarbeiter in EINEM Druckauftrag, je einer pro Blatt. */
  const handleBatchPrint = async () => {
    if (!batchPeriod || selectedBatchIds.length === 0) return
    const range = batchPeriod

    // Das Fenster muss direkt am Klick hängen, sonst hält der Browser es für
    // ein ungefragtes Popup. Deshalb zuerst öffnen, dann die Daten laden.
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Popup blockiert. Bitte Popups für diese Seite erlauben.')
      return
    }
    printWindow.document.write(
      '<!doctype html><meta charset="utf-8"><title>Berichte werden erstellt</title>' +
        '<p style="font-family:sans-serif;margin:24px">Berichte werden erstellt …</p>'
    )

    setBatchPrintProgress(0)
    try {
      const gesammelt = await collectBatchReports(range, fertig => setBatchPrintProgress(fertig))

      const html =
        reportType === 'datev'
          ? buildDatevBatchPrintHtml(
              gesammelt.datevReports,
              `Arbeitszeitdokumentation ${gesammelt.periodLabel}`
            )
          : buildEmployeeBatchPrintHtml(
              gesammelt.employeeReports,
              `Arbeitszeitnachweise ${gesammelt.periodLabel}`
            )

      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()

      let hasTriggeredPrint = false
      const triggerPrint = () => {
        if (hasTriggeredPrint) return
        hasTriggeredPrint = true
        try {
          printWindow.focus()
          printWindow.print()
        } catch (error) {
          console.error('Druckvorschau konnte nicht geöffnet werden:', error)
          toast.error('Druckvorschau konnte nicht geöffnet werden')
        }
      }
      printWindow.onload = () => window.setTimeout(triggerPrint, 120)
      // Fallback, falls onload in einzelnen Browsern nicht feuert.
      window.setTimeout(triggerPrint, 500)
    } catch (error) {
      console.error('Sammeldruck fehlgeschlagen:', error)
      toast.error('Der Sammeldruck konnte nicht erstellt werden.')
      try {
        printWindow.close()
      } catch {
        /* Fenster ist ggf. schon zu */
      }
    } finally {
      setBatchPrintProgress(null)
    }
  }

  /**
   * Die ausgewählten Mitarbeiter in EINER Mail – ein PDF je Mitarbeiter.
   *
   * Bewusst nicht eine Mail pro Mitarbeiter: die Lohnbuchhaltung bekommt zum
   * Monatsabschluss eine Sendung, kann die Berichte aber einzeln ablegen und
   * weiterleiten.
   */
  const handleBatchMail = async () => {
    if (!batchPeriod || selectedBatchIds.length === 0) return
    const empfaenger = mailRecipient.trim()
    if (!isValidEmail(empfaenger)) {
      toast.error('Bitte unten eine gültige Empfängeradresse angeben.')
      return
    }

    const range = batchPeriod
    const istDatev = reportType === 'datev'
    const anzahl = selectedBatchIds.length
    const wort = istDatev
      ? anzahl === 1 ? 'Nachweis' : 'Nachweise'
      : anzahl === 1 ? 'Bericht' : 'Berichte'

    const bestaetigt = window.confirm(
      `${anzahl} ${wort} an ${empfaenger} senden?\n\n` +
        (anzahl < batchEmployeeIds.length
          ? `${batchEmployeeIds.length - anzahl} von ${batchEmployeeIds.length} Mitarbeitern sind abgewählt und gehen nicht mit raus.\n\n`
          : '') +
        'Es geht eine Mail raus, mit einem PDF je Mitarbeiter.'
    )
    if (!bestaetigt) return

    setBatchMailProgress(0)
    try {
      const gesammelt = await collectBatchReports(range, fertig => setBatchMailProgress(fertig))
      const berichte = istDatev ? gesammelt.datevReports : gesammelt.employeeReports
      const reports: ReportMailAttachment[] = []
      for (const bericht of berichte) {
        reports.push(await buildReportAttachment(istDatev ? 'datev' : 'employee', bericht, range))
      }

      await sendReportMail({
        to: empfaenger,
        employeeName: `${anzahl} Mitarbeiter`,
        periodLabel: istDatev ? gesammelt.monthLabel : gesammelt.periodLabel,
        totalHours: minutesToHoursLabel(gesammelt.totalMinutes),
        grossWage: formatCurrency(gesammelt.grossWageAmount),
        note: mailNote.trim(),
        senderName: COMPANY_NAME,
        reports
      })
      toast.success(`${anzahl} ${wort} an ${empfaenger} versendet.`)
      setMailNote('')
    } catch (error: any) {
      console.error('Sammelversand fehlgeschlagen:', error)
      toast.error(error?.message || 'Versand fehlgeschlagen')
    } finally {
      setBatchMailProgress(null)
    }
  }

  /** Blätter-Leiste über dem Bericht – Name, Zeitraum, Pfeile, Sammeldruck/-versand. */
  const renderBatchPager = () => {
    if (batchEmployeeIds.length === 0 || !batchPeriod) return null
    const aktuelleId = batchEmployeeIds[batchIndex]
    const istErster = batchIndex === 0
    const istLetzter = batchIndex >= batchEmployeeIds.length - 1
    const busy =
      isLoading || isBatchLoading || batchPrintProgress !== null || batchMailProgress !== null
    const anzahlGewaehlt = selectedBatchIds.length
    const alleGewaehlt = anzahlGewaehlt === batchEmployeeIds.length
    // Nur bei einer Teilauswahl die Zahlen nennen – bei „alle" wäre das Lärm.
    const auswahlZusatz = alleGewaehlt ? '' : ` (${anzahlGewaehlt}/${batchEmployeeIds.length})`

    return (
      <div className={`batch-pager no-print${batchSelected.has(aktuelleId) ? '' : ' is-skipped'}`}>
        <button
          type="button"
          className="batch-pager-arrow"
          onClick={() => void goToBatchEmployee(batchIndex - 1)}
          disabled={istErster || busy}
          aria-label="Vorheriger Mitarbeiter"
          title="Vorheriger Mitarbeiter"
        >
          ‹
        </button>
        <div className="batch-pager-info">
          <span className="batch-pager-count">
            Mitarbeiter {batchIndex + 1} von {batchEmployeeIds.length}
          </span>
          <strong>{selectedEmployeeName || employeeDisplayName(aktuelleId)}</strong>
          <span className="batch-pager-period">{formatRangeLabel(batchPeriod)}</span>
          <label
            className="batch-pager-select"
            title={'Gilt für „Alle drucken" und „Alle versenden"'}
          >
            <input
              type="checkbox"
              checked={batchSelected.has(aktuelleId)}
              onChange={e => toggleBatchSelection(aktuelleId, e.target.checked)}
              disabled={busy}
            />
            <span>Drucken / Versenden</span>
          </label>
        </div>
        <button
          type="button"
          className="batch-pager-arrow"
          onClick={() => void goToBatchEmployee(batchIndex + 1)}
          disabled={istLetzter || busy}
          aria-label="Nächster Mitarbeiter"
          title="Nächster Mitarbeiter"
        >
          ›
        </button>
        <div className="batch-pager-actions">
          <button
            type="button"
            className="btn primary-btn"
            onClick={() => void handleBatchPrint()}
            disabled={busy || anzahlGewaehlt === 0}
          >
            {batchPrintProgress !== null
              ? `Erstelle ${batchPrintProgress}/${anzahlGewaehlt} …`
              : `Alle drucken${auswahlZusatz}`}
          </button>
          <button
            type="button"
            className="btn primary-btn"
            onClick={() => void handleBatchMail()}
            disabled={busy || anzahlGewaehlt === 0 || !isValidEmail(mailRecipient)}
            title={
              isValidEmail(mailRecipient)
                ? `Eine Mail an ${mailRecipient.trim()} – ein PDF je Mitarbeiter`
                : 'Bitte unten einen gültigen Empfänger eintragen'
            }
          >
            {batchMailProgress !== null
              ? `Sende ${batchMailProgress}/${anzahlGewaehlt} …`
              : `Alle versenden${auswahlZusatz}`}
          </button>
          <button
            type="button"
            className="btn secondary-btn"
            onClick={() => setBatchSelected(alleGewaehlt ? new Set() : new Set(batchEmployeeIds))}
            disabled={busy}
          >
            {alleGewaehlt ? 'Keinen auswählen' : 'Alle auswählen'}
          </button>
          <button type="button" className="btn secondary-btn" onClick={exitBatchMode}>
            Sammelansicht beenden
          </button>
        </div>
        {anzahlGewaehlt === 0 && (
          <p className="batch-pager-warning">
            Kein Mitarbeiter ausgewählt – zum Drucken oder Versenden mindestens einen anhaken.
          </p>
        )}
      </div>
    )
  }

  /** Knopf „für alle erstellen" samt Hinweis – in beiden Berichten identisch. */
  const renderBatchTrigger = (label: string) => (
    <div className="batch-trigger no-print">
      <button
        type="button"
        className="btn secondary-btn"
        onClick={() => void handleSearchAllEmployees()}
        disabled={isBatchLoading || isLoading}
      >
        {isBatchLoading ? 'Suche Mitarbeiter…' : label}
      </button>
      <label className="batch-trigger-option">
        <input
          type="checkbox"
          checked={batchApplyReported}
          onChange={e => setBatchApplyReported(e.target.checked)}
        />
        <span>Gemeldete Stunden je Mitarbeiter übernehmen</span>
      </label>
      <p className="batch-trigger-hint">
        Erstellt die Auswertung für jeden Mitarbeiter mit Zeiteintrag im Zeitraum. Danach mit den
        Pfeilen durchblättern oder alles in einem Druckauftrag ausgeben – ein Mitarbeiter je Blatt.
      </p>
    </div>
  )

  const handleBroadcastOvertimeReminder = async () => {
    // Abgerechnet wird der Vormonat – Anfang August also der Juli.
    const month = previousMonthKey()
    const confirmed = window.confirm(
      `Alle Mitarbeiter fragen, wie viele Stunden für ${monthKeyLabel(month)} abgerechnet werden sollen?\n\n` +
        'Es erscheint ein Popup in der App und – sofern das Gerät angemeldet ist – ' +
        'eine Benachrichtigung auf dem Handy.'
    )
    if (!confirmed) return

    setIsBroadcasting(true)
    try {
      const result = await DataService.triggerOvertimeReminderBroadcast(month)
      const pushInfo =
        result.sent > 0
          ? ` ${result.sent} Gerät${result.sent === 1 ? '' : 'e'} benachrichtigt.`
          : ''
      toast.success(`Erinnerung ausgelöst.${pushInfo}`)
      if (result.message) toast.info(result.message)
    } catch (error: any) {
      toast.error(error?.message || 'Erinnerung konnte nicht ausgelöst werden.')
    } finally {
      setIsBroadcasting(false)
    }
  }

  const handleSaveRecipient = async () => {
    try {
      await saveReportMailRecipient(mailRecipient)
      toast.success('Empfänger gespeichert.')
    } catch (error: any) {
      toast.error(error?.message || 'Empfänger konnte nicht gespeichert werden.')
    }
  }

  /**
   * Erzeugt den PDF-Anhang eines Berichts. Die PDF-Bibliothek wird erst hier
   * geladen – sie gehört nicht in das Bundle, das beim Öffnen der App zieht.
   */
  const buildReportAttachment = async (
    art: 'employee' | 'datev',
    daten: EmployeePrintParams | DatevPrintParams,
    range: { start: string; end: string }
  ): Promise<ReportMailAttachment> => {
    const { buildEmployeeReportPdf, buildDatevReportPdf, pdfToBase64 } = await import(
      './reports/reportPdf'
    )
    const bytes =
      art === 'datev'
        ? await buildDatevReportPdf(daten as DatevPrintParams)
        : await buildEmployeeReportPdf(daten as EmployeePrintParams)
    return {
      filename: reportFilename(
        art === 'datev' ? 'datev-nachweis' : 'zeiterfassungsbericht',
        daten.employeeName,
        range
      ),
      contentBase64: pdfToBase64(bytes)
    }
  }

  const handleSendReportMail = async () => {
    const istDatev = reportType === 'datev'
    if (istDatev ? datevRows.length === 0 : reportEntries.length === 0) {
      toast.error('Kein Bericht zum Versenden vorhanden')
      return
    }
    if (!isValidEmail(mailRecipient)) {
      toast.error('Bitte eine gültige Empfängeradresse angeben.')
      return
    }

    setIsSendingMail(true)
    try {
      const range = { start: startDate, end: endDate }
      const anhang = istDatev
        ? await buildReportAttachment('datev', currentDatevParams(), range)
        : await buildReportAttachment('employee', currentEmployeeParams(), range)

      await sendReportMail({
        to: mailRecipient.trim(),
        employeeName: selectedEmployeeName,
        periodLabel: istDatev && periodMonthKey ? monthKeyLabel(periodMonthKey) : formatPeriod(),
        totalHours: minutesToHoursLabel(
          istDatev ? datevTotalMinutes(datevRows) : adjustedReport.shownTotalMinutes
        ),
        grossWage: formatCurrency(adjustedReport.summary.grossWageAmount),
        note: mailNote.trim(),
        senderName: COMPANY_NAME,
        reports: [anhang]
      })
      toast.success(`Bericht an ${mailRecipient.trim()} versendet.`)
      setMailNote('')
    } catch (error: any) {
      toast.error(error?.message || 'Versand fehlgeschlagen')
    } finally {
      setIsSendingMail(false)
    }
  }

  /**
   * Versand-Panel – identisch in der Mitarbeiter-Zeitauswertung und im
   * DATEV-Nachweis. Der Empfänger wird gepflegt und gespeichert, damit er nicht
   * bei jedem Versand neu eingetippt werden muss.
   */
  const renderMailPanel = () => {
    const istDatev = reportType === 'datev'
    const hatInhalt = istDatev ? datevRows.length > 0 : reportEntries.length > 0

    return (
      <div className="report-mail-panel no-print">
        <div className="report-mail-head">
          <h4>{istDatev ? 'Nachweis per E-Mail senden' : 'Bericht per E-Mail senden'}</h4>
          <span className="report-mail-attachment">
            Anhang: {istDatev ? 'Nachweis' : 'Bericht'} als PDF
          </span>
        </div>
        <div className="report-mail-row">
          <label className="report-mail-field">
            Empfänger
            <input
              type="email"
              value={mailRecipient}
              onChange={e => setMailRecipient(e.target.value)}
              placeholder="name@kanzlei.de"
              className="inline-edit"
            />
          </label>
          <button
            type="button"
            className="btn secondary-btn"
            onClick={handleSaveRecipient}
            disabled={!isValidEmail(mailRecipient)}
          >
            Empfänger merken
          </button>
        </div>
        <label className="report-mail-field report-mail-note">
          Nachricht (optional)
          <textarea
            value={mailNote}
            onChange={e => setMailNote(e.target.value)}
            rows={2}
            placeholder="z. B. Bitte um Prüfung bis Monatsende."
            className="inline-edit"
          />
        </label>
        <div className="report-mail-actions">
          <button
            type="button"
            className="btn primary-btn"
            onClick={handleSendReportMail}
            disabled={isSendingMail || !hatInhalt || !isValidEmail(mailRecipient)}
          >
            {isSendingMail ? 'Sende…' : istDatev ? 'Nachweis senden' : 'Bericht senden'}
          </button>
          <span className="report-mail-hint">
            {istDatev
              ? 'Versendet wird der Nachweis in der aktuell angezeigten Fassung – inklusive Abrechnungsblatt auf Seite 2.'
              : 'Versendet wird der Bericht in der aktuell angezeigten Fassung – inklusive Abrechnungsblock mit dem Bruttolohn.'}
          </span>
        </div>
      </div>
    )
  }

  const hasEdits = reportEntries.some(e => e.isEdited)
  const unsavedRowCount = reportEntries.filter(rowHasPersistableChange).length

  /** Projekte für die Auswahl in den Berichtszeilen (aktive zuerst). */
  const projectOptionsForRows = [...projects]
    .filter(p => p.id)
    .sort((a, b) => {
      const aArchived = a.status === 'archived' || a.isActive === false
      const bArchived = b.status === 'archived' || b.isActive === false
      if (aArchived !== bArchived) return aArchived ? 1 : -1
      return (a.name || '').localeCompare(b.name || '', 'de')
    })
    .map(p => ({
      id: p.id,
      label:
        p.status === 'archived' || p.isActive === false
          ? `${p.name || p.id} (archiviert)`
          : p.name || p.id
    }))

  const settlementLinesPreview =
    reportType === 'employee' && reportEntries.length > 0 ? buildSettlementLinesFromEntries() : []
  const remainderHasTimeChange = settlementLinesPreview.some(l => l.rawMinutes !== l.correctedMinutes)
  const remainderHasShortening = settlementLinesPreview.some(l => l.paidOutMinutes > 0)
  const isEmployeeReportEnabled = availableReportTypes.includes('employee')
  const isProjectReportEnabled = availableReportTypes.includes('project')
  const isDatevReportEnabled = availableReportTypes.includes('datev')
  const showReportTypeTabs = availableReportTypes.length > 1

  const projectJournalDays =
    reportType === 'project' && hasSearched && selectedProject ? buildProjectDayBlocks() : []

  return (
    <div className="reports-tab">
      {/* Tab-Auswahl */}
      {showReportTypeTabs && (
        <div className="report-type-tabs no-print">
          {isEmployeeReportEnabled && (
            <button
              className={`report-type-btn ${reportType === 'employee' ? 'active' : ''}`}
              onClick={() => setReportType('employee')}
            >
              Mitarbeiter-Zeitauswertung
            </button>
          )}
          {isProjectReportEnabled && (
            <button
              className={`report-type-btn ${reportType === 'project' ? 'active' : ''}`}
              onClick={() => setReportType('project')}
            >
              Projekt-Nachkalkulation
            </button>
          )}
          {isDatevReportEnabled && (
            <button
              className={`report-type-btn ${reportType === 'datev' ? 'active' : ''}`}
              onClick={() => setReportType('datev')}
            >
              DATEV-Nachweis
            </button>
          )}
        </div>
      )}

      {/* ==================== MITARBEITER-BERICHT ==================== */}
      {isEmployeeReportEnabled && reportType === 'employee' && (
        <>
          {/* Monatsabschluss: betrifft alle Mitarbeiter, nicht den ausgewählten. */}
          <div className="broadcast-panel no-print">
            <div className="broadcast-text">
              <h3>Monatsabschluss {monthKeyLabel(previousMonthKey())} – alle Mitarbeiter fragen</h3>
              <p>
                Fragt alle Mitarbeiter, wie viele Stunden für{' '}
                <strong>{monthKeyLabel(previousMonthKey())}</strong> abgerechnet werden sollen:
                Popup in der App und Benachrichtigung auf angemeldete Handys, beides führt direkt
                zur Eingabe. Wer für den Monat bereits etwas eingetragen hat, wird nicht behelligt.
              </p>
            </div>
            <button
              type="button"
              className="btn primary-btn"
              onClick={handleBroadcastOvertimeReminder}
              disabled={isBroadcasting}
            >
              {isBroadcasting ? 'Sende…' : 'Jetzt alle erinnern'}
            </button>
          </div>

          <div className="report-filters no-print">
            <h3>Zeitauswertung erstellen</h3>
            <div className="filter-row">
              <div className="filter-group">
                <label>Mitarbeiter:</label>
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                  <option value="">-- Bitte wählen --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || `${emp.firstName} ${emp.lastName}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="filter-row">
              <div className="filter-group">
                <label>Von:</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="filter-group">
                <label>Bis:</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <button
              onClick={() => {
                exitBatchMode()
                void handleEmployeeSearch()
              }}
              className="btn primary-btn search-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Lädt...' : 'Auswertung laden'}
            </button>
            {renderBatchTrigger('Auswertung für alle erstellen')}
          </div>

          {hasSearched && (
            <div className="report-content">
              {renderBatchPager()}

              <div className="print-header print-only">
                <h2>Arbeitszeitnachweis</h2>
                <div className="print-meta">
                  <p><strong>Mitarbeiter:</strong> {selectedEmployeeName}</p>
                  <p><strong>Zeitraum:</strong> {formatPeriod()}</p>
                  <p><strong>Erstellt am:</strong> {new Date().toLocaleDateString('de-DE')}</p>
                </div>
              </div>

              <div className="report-actions no-print">
                <div className="actions-left">
                  <h4>Bericht für {selectedEmployeeName} <span className="date-range">({formatPeriod()})</span></h4>
                  {hasEdits && !directSave && (
                    <span className="edit-hint">Es gibt temporäre Änderungen (nur für Druck)</span>
                  )}
                  {hasEdits && directSave && (
                    <span className="edit-hint">
                      Noch nicht gespeicherte Zeilen – Feld verlassen oder „Speichern“ in der Zeile antippen
                    </span>
                  )}
                  <div className="settlement-inline-hint">
                    {employeeSettlement && (
                      <p>
                        Gespeicherte Abrechnung: Rohzeit {minutesToHoursLabel(employeeSettlement.rawTotalMinutes)} →
                        korrigiert {minutesToHoursLabel(employeeSettlement.correctedTotalMinutes)}; Differenz
                        (abgerechnet) {minutesToHoursLabel(employeeSettlement.paidOutMinutes)}
                      </p>
                    )}
                    {typeof employees.find(e => e.id === selectedEmployeeId)?.overtimeBalanceMinutes === 'number' && (
                      <p>
                        Überstunden-Saldo am Mitarbeiter:{' '}
                        <strong>
                          {minutesToHoursLabel(
                            employees.find(e => e.id === selectedEmployeeId)!.overtimeBalanceMinutes as number
                          )}
                        </strong>{' '}
                        — kann im Mitarbeiter-Profil gesetzt werden; wird bei Abrechnung um die Differenz verringert,
                        falls ein Saldo hinterlegt ist.
                      </p>
                    )}
                  </div>
                </div>
                <div className="actions-right">
                  <button
                    type="button"
                    className="btn secondary-btn"
                    onClick={() => setShowAddEntryModal(true)}
                    disabled={!selectedEmployeeId}
                  >
                    + Stempelsatz
                  </button>
                  {unsavedRowCount > 0 && (
                    <button
                      type="button"
                      className="btn primary-btn"
                      onClick={handleSaveAllRows}
                      disabled={savingEntryIds.size > 0}
                    >
                      {savingEntryIds.size > 0
                        ? 'Speichert…'
                        : `${unsavedRowCount} Zeile${unsavedRowCount === 1 ? '' : 'n'} speichern`}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn secondary-btn ${employeeReportView === 'remainder' ? 'active-toggle' : ''}`}
                    onClick={() =>
                      setEmployeeReportView(v => (v === 'full' ? 'remainder' : 'full'))
                    }
                  >
                    {employeeReportView === 'remainder' ? 'Volle Tabelle' : 'Restliche Stunden'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary-btn"
                    onClick={handleSaveTimeSettlement}
                    disabled={isSavingSettlement || reportEntries.length === 0}
                  >
                    {isSavingSettlement ? 'Speichert…' : 'Korrektur abrechnen & speichern'}
                  </button>
                  {hasEdits && (
                    <button onClick={() => void handleEmployeeSearch()} className="btn secondary-btn">
                      Zurücksetzen
                    </button>
                  )}
                  <button onClick={handlePrint} className="btn primary-btn" disabled={isPreparingPrint}>
                    {isPreparingPrint ? 'Vorbereitung…' : 'Drucken'}
                  </button>
                </div>
              </div>

              {renderMailPanel()}

              <div className="edit-notice no-print">
                <label className="direct-save-toggle">
                  <input
                    type="checkbox"
                    checked={directSave}
                    onChange={e => updateDirectSave(e.target.checked)}
                  />
                  <span>Änderungen direkt in die Datenbank speichern</span>
                </label>
                {directSave ? (
                  <p>
                    <strong>Direktmodus aktiv:</strong> Projekt, Kommen, Gehen und Pause werden beim Verlassen des
                    Feldes sofort gespeichert – ein Projektwechsel zieht Fotos, Dokumente und Fahrzeugbuchungen mit um.
                    Über <strong>Löschen</strong> entfernen Sie einen Stempelsatz endgültig, über
                    <strong> + Stempelsatz</strong> tragen Sie einen fehlenden Satz nach. Weil die Rohzeit dabei
                    mitwandert, bleiben „Restliche Stunden“ leer – für eine Auszahlungs-Differenz den Direktmodus
                    ausschalten.
                  </p>
                ) : (
                  <p>
                    <strong>Hinweis:</strong> Änderungen sind nur temporär für den Druck, bis Sie sie mit „Korrektur
                    abrechnen &amp; speichern“ festhalten. „Restliche Stunden“ zeigt die pro Tag gekürzte Zeit (Rohzeit
                    minus korrigierte Zeit). Mit „Speichern“ in der Zeile schreiben Sie eine Korrektur trotzdem direkt
                    in die Datenbank.
                  </p>
                )}
              </div>

              {renderSettlementNote()}

              {reportEntries.length > 0 && (
                <div className="overtime-panel no-print">
                  <div className="overtime-panel-head">
                    <label className="overtime-toggle">
                      <input
                        type="checkbox"
                        checked={overtimeMode}
                        onChange={e => {
                          setOvertimeMode(e.target.checked)
                          if (!e.target.checked) {
                            setAppliedPayoutMinutes(0)
                            setPayoutInput('0:00')
                          }
                        }}
                      />
                      <span>Nur Regelarbeitszeit ausweisen (Überstunden bleiben auf dem Konto)</span>
                    </label>
                    <div className="overtime-facts">
                      {overtimeBalanceMinutes != null && (
                        <span>
                          Überstundenkonto: <strong>{minutesToHoursLabel(overtimeBalanceMinutes)}</strong>
                        </span>
                      )}
                      {overtimeMode && (
                        <span>
                          Im Zeitraum über Regelarbeitszeit:{' '}
                          <strong>{minutesToHoursLabel(adjustedReport.overtimeAvailableMinutes)}</strong>
                        </span>
                      )}
                      <label className="meal-rate-field">
                        Verpflegungsmehraufwand €/Tag
                        <input
                          type="text"
                          inputMode="decimal"
                          value={mealAllowanceInput}
                          onChange={e => setMealAllowanceInput(e.target.value)}
                          className="inline-edit overtime-input"
                          placeholder="z. B. 14"
                        />
                      </label>
                    </div>
                  </div>

                  {overtimeMode && (
                    <>
                      <div className="overtime-controls">
                        <label>
                          Regelarbeitszeit Mo–Do
                          <input
                            type="text"
                            inputMode="numeric"
                            value={regularMonThuInput}
                            onChange={e => setRegularMonThuInput(e.target.value)}
                            className="inline-edit overtime-input"
                            placeholder="8:00"
                          />
                        </label>
                        <label>
                          Freitag
                          <input
                            type="text"
                            inputMode="numeric"
                            value={regularFriInput}
                            onChange={e => setRegularFriInput(e.target.value)}
                            className="inline-edit overtime-input"
                            placeholder="6:00"
                          />
                        </label>
                        <label>
                          Davon auszahlen
                          <input
                            type="text"
                            inputMode="numeric"
                            value={payoutInput}
                            onChange={e => setPayoutInput(e.target.value)}
                            className="inline-edit overtime-input"
                            placeholder="2:00"
                          />
                        </label>
                        <button type="button" className="btn secondary-btn" onClick={handleApplyPayout}>
                          In Zeilen übernehmen
                        </button>
                        {appliedPayoutMinutes > 0 && (
                          <button
                            type="button"
                            className="btn secondary-btn"
                            onClick={() => {
                              setAppliedPayoutMinutes(0)
                              setPayoutInput('0:00')
                            }}
                          >
                            Zurücksetzen
                          </button>
                        )}
                      </div>

                      {adjustedReport.payoutMinutes > 0 && (
                        <p className="overtime-result">
                          <strong>{minutesToHoursLabel(adjustedReport.payoutMinutes)}</strong> auf{' '}
                          {adjustedReport.days.filter(d => d.payoutMinutes > 0).length} Tage verteilt.
                          {overtimeBalanceMinutes != null && (
                            <>
                              {' '}Konto nach dem Speichern:{' '}
                              <strong>
                                {minutesToHoursLabel(
                                  Math.max(0, overtimeBalanceMinutes - adjustedReport.payoutMinutes)
                                )}
                              </strong>
                              .
                            </>
                          )}
                        </p>
                      )}
                      {adjustedReport.payoutBeyondActualMinutes > 0 && (
                        <p className="overtime-warning">
                          Achtung: {minutesToHoursLabel(adjustedReport.payoutBeyondActualMinutes)} davon
                          gehen über die tatsächlich gestempelte Zeit hinaus und füllen andere Tage bis
                          zur 10-Std-Grenze auf.
                        </p>
                      )}
                      <p className="overtime-hint">
                        Die Auszahlung wird erst mit „Korrektur abrechnen &amp; speichern“ vom
                        Überstundenkonto abgezogen. Stempelsätze, Nachkalkulation und Tagesbericht
                        bleiben in jedem Fall unberührt.
                      </p>
                    </>
                  )}
                </div>
              )}

              {reportEntries.length === 0 ? (
                <p className="no-data">Keine Zeiteinträge gefunden</p>
              ) : employeeReportView === 'remainder' ? (
                <div className="report-table-container">
                  {getRemainderLines().length === 0 ? (
                    <div className="no-data remainder-empty-hint">
                      {!remainderHasTimeChange && hasEdits ? (
                        <p>
                          Sie haben nur das <strong>Projekt</strong> angepasst — die Stempelzeiten sind unverändert.
                          „Restliche Stunden“ erscheinen nur, wenn Sie <strong>Kommen, Gehen oder Pause</strong> so ändern,
                          dass die berechnete Arbeitszeit <strong>kürzer</strong> wird als die gespeicherte Rohzeit.
                        </p>
                      ) : remainderHasTimeChange && !remainderHasShortening ? (
                        <p>
                          Die korrigierten Zeiten sind nirgends <strong>kürzer</strong> als die Rohzeit (z.&nbsp;B. nur
                          verlängert oder weniger Pause). Dadurch gibt es keine abzutrennenden „Rest-Stunden“.
                        </p>
                      ) : (
                        <p>
                          Keine gekürzte Arbeitszeit gegenüber der Rohzeit. In der Ansicht „Volle Tabelle“ Kommen/Gehen/
                          Pause anpassen, dann erneut „Restliche Stunden“ öffnen.
                        </p>
                      )}
                    </div>
                  ) : (
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Tag</th>
                          <th>Abgetrennte Stunden (Roh − korrigiert)</th>
                          <th className="no-print">Hinweis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getRemainderLines().map(line => (
                          <tr key={line.timeEntryId}>
                            <td>{line.dateLabel}</td>
                            <td className="hours-cell">{minutesToHoursLabel(line.paidOutMinutes)}</td>
                            <td className="no-print muted-cell">
                              Roh {minutesToHoursLabel(line.rawMinutes)} → korr.{' '}
                              {minutesToHoursLabel(line.correctedMinutes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="total-row">
                          <td><strong>Summe abgetrennt:</strong></td>
                          <td className="hours-cell">
                            <strong>
                              {minutesToHoursLabel(
                                getRemainderLines().reduce((s, l) => s + l.paidOutMinutes, 0)
                              )}
                            </strong>
                          </td>
                          <td className="no-print"></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              ) : (
                <>
                <p className="report-scroll-hint no-print">
                  Tabelle seitlich scrollbar – der Tag bleibt dabei stehen.
                </p>
                <div className="report-table-container">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Projekt</th>
                        <th>Kommen</th>
                        <th>Gehen</th>
                        <th>Pause</th>
                        <th>Dokumentation</th>
                        <th>Arbeitszeit</th>
                        <th className="no-print">Akt.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustedEntries.map((entry, index) => {
                        const isSavingRow = savingEntryIds.has(entry.id)
                        const isSavedRow = savedEntryIds.has(entry.id)
                        const canPersist = rowHasPersistableChange(entry)
                        const isEditable = !entry.isReadOnly && entry.source === 'time-entry'
                        const adjustmentTitle = describeAdjustments(entry)
                        const clockOutShifted = entry.effectiveClockOut !== entry.clockOut
                        const pauseAdjusted = entry.effectivePauseMinutes !== entry.pauseMinutes
                        return (
                        <tr
                          key={entry.id}
                          className={[
                            entry.isEdited ? 'edited-row' : '',
                            isSavedRow ? 'saved-row' : '',
                            entry.source === 'leave-request' ? 'vacation-report-row' : '',
                            entry.holidayName ? 'holiday-report-row' : ''
                          ].filter(Boolean).join(' ')}
                        >
                          <td className="date-cell">
                            {entry.date}
                            {entry.holidayName && (
                              <span className="day-marker">Feiertag: {entry.holidayName}</span>
                            )}
                          </td>
                          <td>
                            {isEditable ? (
                              <select
                                value={projectOptionsForRows.some(o => o.id === entry.projectId) ? entry.projectId : ''}
                                onChange={e => {
                                  const nextProjectId = e.target.value
                                  handleFieldChange(index, 'projectId', nextProjectId)
                                  if (directSave && nextProjectId) {
                                    // Projektwechsel sofort umziehen (Fotos/Fahrzeuge inklusive)
                                    void persistRow(
                                      {
                                        ...entry,
                                        projectId: nextProjectId,
                                        projectName: getProjectName(nextProjectId),
                                        isEdited: true
                                      },
                                      { silent: true }
                                    )
                                  }
                                }}
                                className="inline-edit project-select"
                                disabled={isSavingRow}
                                title={entry.projectName}
                              >
                                <option value="">
                                  {entry.projectId ? entry.projectName : '— kein Projekt —'}
                                </option>
                                {projectOptionsForRows.map(option => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="project-static">{entry.projectName}</span>
                            )}
                          </td>
                          <td>
                            <input
                              type="time"
                              value={entry.clockIn}
                              onChange={e => handleFieldChange(index, 'clockIn', e.target.value)}
                              onBlur={() => handleRowBlur(entry)}
                              className="inline-edit time-input"
                              disabled={entry.isReadOnly}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              value={entry.clockOut}
                              onChange={e => handleFieldChange(index, 'clockOut', e.target.value)}
                              onBlur={() => handleRowBlur(entry)}
                              className="inline-edit time-input"
                              disabled={entry.isReadOnly}
                            />
                            {clockOutShifted && (
                              <span className="legal-adjust-note" title={adjustmentTitle}>
                                Bericht: {entry.effectiveClockOut}
                              </span>
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={entry.pauseMinutes}
                              onChange={e => handleFieldChange(index, 'pauseMinutes', e.target.value)}
                              onBlur={() => handleRowBlur(entry)}
                              className="inline-edit pause-input"
                              disabled={entry.isReadOnly}
                            />
                            {pauseAdjusted && (
                              <span className="legal-adjust-note" title={adjustmentTitle}>
                                gesetzl. {entry.effectivePauseMinutes} Min
                              </span>
                            )}
                          </td>
                          <td className="comment-cell">{entry.notes || '—'}</td>
                          <td className="hours-cell">
                            <span
                              className={entry.workTimeAdjustments.length > 0 ? 'hours-adjusted' : ''}
                              title={adjustmentTitle}
                            >
                              {minutesToDecimalHours(entry.effectiveWorkMinutes)}
                            </span>
                            {entry.effectiveWorkHours !== entry.workHours && (
                              <span className="legal-adjust-note" title={adjustmentTitle}>
                                gestempelt {entry.workHours}
                              </span>
                            )}
                          </td>
                          <td className="no-print actions-cell row-actions-cell">
                            {isSavingRow ? (
                              <span className="row-status saving">Speichert…</span>
                            ) : (
                              <>
                                {canPersist && (
                                  <button
                                    type="button"
                                    onClick={() => void persistRow(entry)}
                                    className="row-save-btn"
                                    title="Diese Zeile in die Datenbank speichern"
                                  >
                                    Speichern
                                  </button>
                                )}
                                {entry.isEdited && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetEntry(index)}
                                    className="reset-btn"
                                  >
                                    Zurück
                                  </button>
                                )}
                                {isEditable && !entry.isEdited && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteRow(entry.id)}
                                    className="row-delete-btn"
                                    title="Stempelsatz endgültig löschen"
                                  >
                                    Löschen
                                  </button>
                                )}
                                {isSavedRow && !entry.isEdited && (
                                  <span className="row-status saved">Gespeichert</span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td colSpan={6}>
                          <strong>Gesamt:</strong>
                          {legalCorrectionMinutes > 0 && (
                            <span className="total-note">
                              gestempelt {minutesToHoursLabel(adjustedReport.stampedTotalMinutes)}, davon
                              gesetzliche Korrektur −{minutesToHoursLabel(legalCorrectionMinutes)}
                            </span>
                          )}
                          {overtimeMode &&
                            adjustedReport.legalTotalMinutes !== adjustedReport.shownTotalMinutes && (
                              <span className="total-note">
                                als Überstunden auf dem Konto belassen: −
                                {minutesToHoursLabel(
                                  adjustedReport.legalTotalMinutes - adjustedReport.shownTotalMinutes
                                )}
                              </span>
                            )}
                        </td>
                        <td className="hours-cell">
                          <strong>{calculateTotalHours()}</strong>
                        </td>
                        <td className="no-print"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                </>
              )}

              {reportEntries.length > 0 && (
                <div className="settlement-summary">
                  <h4>Abrechnung</h4>
                  <table className="settlement-summary-table">
                    <tbody>
                      <tr>
                        <td>Geleistete Arbeitsstunden</td>
                        <td>
                          {minutesToHoursLabel(adjustedReport.summary.workMinutes)} Std
                          {!adjustedReport.summary.isFixedSalary &&
                            ` × ${formatCurrency(adjustedReport.summary.hourlyRate)}`}
                        </td>
                        <td className="number-cell">
                          {adjustedReport.summary.isFixedSalary
                            ? '—'
                            : formatCurrency(adjustedReport.summary.workAmount)}
                        </td>
                      </tr>
                      <tr>
                        <td>Urlaubsstunden</td>
                        <td>
                          {minutesToHoursLabel(adjustedReport.summary.vacationMinutes)} Std
                          {!adjustedReport.summary.isFixedSalary &&
                            ` × ${formatCurrency(adjustedReport.summary.hourlyRate)}`}
                        </td>
                        <td className="number-cell">
                          {adjustedReport.summary.isFixedSalary
                            ? '—'
                            : formatCurrency(adjustedReport.summary.vacationAmount)}
                        </td>
                      </tr>
                      <tr>
                        <td>Feiertagsstunden</td>
                        <td>
                          {minutesToHoursLabel(adjustedReport.summary.holidayMinutes)} Std
                          {!adjustedReport.summary.isFixedSalary &&
                            ` × ${formatCurrency(adjustedReport.summary.hourlyRate)}`}
                        </td>
                        <td className="number-cell">
                          {adjustedReport.summary.isFixedSalary
                            ? '—'
                            : formatCurrency(adjustedReport.summary.holidayAmount)}
                        </td>
                      </tr>
                      <tr>
                        <td>Krankheitstage</td>
                        <td>
                          {adjustedReport.summary.sickDays} Tage (
                          {minutesToHoursLabel(adjustedReport.summary.sickMinutes)} Std)
                          {!adjustedReport.summary.isFixedSalary &&
                            ` × ${formatCurrency(adjustedReport.summary.hourlyRate)}`}
                        </td>
                        <td className="number-cell">
                          {adjustedReport.summary.isFixedSalary
                            ? '—'
                            : formatCurrency(adjustedReport.summary.sickAmount)}
                        </td>
                      </tr>
                      <tr className="settlement-total">
                        <td>
                          {adjustedReport.summary.isFixedSalary ? 'Fixlohn' : 'Bruttolohn'} (steuer-
                          und SV-pflichtig)
                        </td>
                        <td>
                          {adjustedReport.summary.isFixedSalary ? (
                            'Monatliche Ausbildungsvergütung'
                          ) : (
                            <>
                              {minutesToHoursLabel(adjustedReport.summary.grossWageMinutes)} Std ×{' '}
                              {formatCurrency(adjustedReport.summary.hourlyRate)}
                            </>
                          )}
                        </td>
                        <td className="number-cell">
                          {formatCurrency(adjustedReport.summary.grossWageAmount)}
                        </td>
                      </tr>
                      <tr>
                        <td>Verpflegungsmehraufwand (steuerfrei)</td>
                        <td>
                          {adjustedReport.summary.mealAllowanceDays} Tage ×{' '}
                          {formatCurrency(adjustedReport.summary.mealAllowanceRate)}
                        </td>
                        <td className="number-cell">
                          {formatCurrency(adjustedReport.summary.mealAllowanceAmount)}
                        </td>
                      </tr>
                      <tr className="settlement-total">
                        <td>Auszahlung gesamt</td>
                        <td>
                          {adjustedReport.summary.isFixedSalary ? 'Fixlohn' : 'Bruttolohn'} +
                          steuerfreie Zuwendungen
                        </td>
                        <td className="number-cell">
                          {formatCurrency(adjustedReport.summary.totalPayoutAmount)}
                        </td>
                      </tr>
                      <tr className="settlement-note">
                        <td>Nicht abgerechnete Überstunden</td>
                        <td>{minutesToHoursLabel(adjustedReport.summary.openOvertimeMinutes)} Std</td>
                        <td className="number-cell">—</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="settlement-summary-hint no-print">
                    An den Steuerberater zu melden ist{' '}
                    {adjustedReport.summary.isFixedSalary ? 'der Fixlohn' : 'der Bruttolohn'} von{' '}
                    <strong>{formatCurrency(adjustedReport.summary.grossWageAmount)}</strong> – ohne
                    den steuerfreien Verpflegungsmehraufwand.
                  </p>
                  {adjustedReport.summary.isFixedSalary ? (
                    <>
                      {adjustedReport.summary.grossWageAmount === 0 && (
                        <p className="settlement-summary-hint no-print">
                          Für {selectedEmployeeName} ist als Azubi kein Fixlohn hinterlegt – der
                          Betrag bleibt deshalb bei 0,00 €. Er lässt sich im Mitarbeiter-Profil
                          setzen.
                        </p>
                      )}
                      {!isFullCalendarMonth && (
                        <p className="settlement-summary-hint no-print">
                          Der gewählte Zeitraum ist kein voller Kalendermonat. Der Fixlohn wird
                          trotzdem in voller Höhe ausgewiesen – bitte prüfen, ob das so gemeldet
                          werden soll.
                        </p>
                      )}
                    </>
                  ) : (
                    adjustedReport.summary.hourlyRate === 0 && (
                      <p className="settlement-summary-hint no-print">
                        Für {selectedEmployeeName} ist kein Stundenlohn hinterlegt – die Beträge
                        bleiben deshalb bei 0,00 €. Der Satz lässt sich im Mitarbeiter-Profil setzen.
                      </p>
                    )
                  )}
                </div>
              )}

              <div className="print-footer print-only">
                <div className="signature-line">
                  <div className="signature-box"><p>{selectedEmployeeName || 'Mitarbeiter'}</p><div className="line"></div></div>
                  <div className="signature-box"><p>{COMPANY_NAME}</p><div className="line"></div></div>
                </div>
              </div>
            </div>
          )}

          {showAddEntryModal && selectedEmployeeId && (
            <ReportAddEntryModal
              employeeId={selectedEmployeeId}
              employeeName={selectedEmployeeName}
              projects={projects}
              defaultDate={startDate}
              onClose={() => setShowAddEntryModal(false)}
              onSaved={handleEmployeeSearch}
            />
          )}
        </>
      )}

      {/* ==================== DATEV-NACHWEIS ==================== */}
      {isDatevReportEnabled && reportType === 'datev' && (
        <>
          <div className="report-filters no-print">
            <h3>DATEV-Nachweis erstellen</h3>
            <div className="filter-row">
              <div className="filter-group">
                <label>Mitarbeiter:</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                >
                  <option value="">-- Bitte wählen --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || `${emp.firstName} ${emp.lastName}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="filter-row">
              <div className="filter-group">
                <label>Von:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label>Bis:</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <button
              onClick={() => {
                exitBatchMode()
                void handleEmployeeSearch()
              }}
              className="btn primary-btn search-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Lädt...' : 'Nachweis laden'}
            </button>
            {renderBatchTrigger('Nachweis für alle erstellen')}
          </div>

          {hasSearched && (
            <div className="report-content">
              {renderBatchPager()}

              {renderSettlementNote()}

              <div className="report-actions no-print">
                <div className="actions-left">
                  <h4>
                    {selectedEmployeeName}
                    <span className="date-range">
                      {periodMonthKey ? monthKeyLabel(periodMonthKey) : formatPeriod()}
                    </span>
                  </h4>
                </div>
                <div className="actions-right">
                  <button onClick={handleDatevPrint} className="btn primary-btn">
                    Drucken
                  </button>
                </div>
              </div>

              {renderMailPanel()}

              <p className="report-scroll-hint no-print">
                Tabelle seitlich scrollbar – der Tag bleibt dabei stehen.
              </p>
              <div className="report-table-container">
                <table className="report-table datev-table">
                  <thead>
                    <tr>
                      <th>Kalendertag</th>
                      <th>Beginn</th>
                      <th>Pause</th>
                      <th>Ende</th>
                      <th>Dauer</th>
                      <th>*</th>
                      <th>Bemerkungen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datevRows.map((row) => (
                      <tr key={row.dateKey} className={row.key ? 'datev-key-row' : ''}>
                        <td className="hours-cell">{row.day}</td>
                        <td className="hours-cell">{row.begin}</td>
                        <td className="hours-cell">
                          {row.pauseMinutes > 0 ? minutesToDecimalHours(row.pauseMinutes) : ''}
                        </td>
                        <td className="hours-cell">{row.end}</td>
                        <td className="hours-cell">
                          {row.workMinutes > 0 ? minutesToDecimalHours(row.workMinutes) : ''}
                        </td>
                        <td className="hours-cell">
                          <strong>{row.key}</strong>
                        </td>
                        <td>{row.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td colSpan={4}>
                        <strong>Summe:</strong>
                      </td>
                      <td className="hours-cell">
                        <strong>{minutesToDecimalHours(datevTotalMinutes(datevRows))}</strong>
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="datev-legend no-print">
                {DATEV_KEY_LEGEND.map((item) => `${item.key} = ${item.label}`).join(' · ')}
              </p>
            </div>
          )}
        </>
      )}

      {/* ==================== PROJEKT-BERICHT ==================== */}
      {isProjectReportEnabled && reportType === 'project' && (
        <>
          <div className="report-filters no-print">
            <h3>Projekt-Nachkalkulation</h3>
            <div className="filter-row">
              <div className="filter-group">
                <label>Projekt:</label>
                <SearchableSelect
                  options={[...projects]
                    .sort((a, b) => {
                      // Aktive zuerst, archivierte ans Ende; sonst alphabetisch
                      const aArchived = a.status === 'archived' || a.isActive === false
                      const bArchived = b.status === 'archived' || b.isActive === false
                      if (aArchived !== bArchived) return aArchived ? 1 : -1
                      return (a.name || '').localeCompare(b.name || '', 'de')
                    })
                    .map(proj => {
                      const archived = proj.status === 'archived' || proj.isActive === false
                      const base = proj.client ? `${proj.name} (${proj.client})` : proj.name || proj.id
                      // Archivierte klar kennzeichnen, damit doppelte Namen unterscheidbar sind
                      return { value: proj.id, label: archived ? `${base} — archiviert` : base }
                    })}
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  placeholder="-- Bitte wählen --"
                  searchPlaceholder="Projekt oder Kunde suchen…"
                  emptyText="Kein passendes Projekt"
                />
              </div>
            </div>
            
            <div className="filter-row checkbox-row">
              <label className="checkbox-label">
                <input type="checkbox" checked={useTimeFilter} onChange={(e) => setUseTimeFilter(e.target.checked)} />
                <span>Zeitraum filtern (optional)</span>
              </label>
            </div>
            
            {useTimeFilter && (
              <div className="filter-row">
                <div className="filter-group">
                  <label>Von:</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="filter-group">
                  <label>Bis:</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

            <button onClick={handleProjectSearch} className="btn primary-btn search-btn" disabled={isLoading}>
              {isLoading ? 'Lädt...' : 'Kalkulation erstellen'}
            </button>
          </div>

          {hasSearched && selectedProject && (
            <div className="report-content project-report">
              {/* Druck-Header */}
              <div className="print-header print-only">
                <h2>Projekt-Nachkalkulation</h2>
              </div>

              {/* Aktionsleiste */}
              <div className="report-actions no-print">
                <div className="actions-left">
                  <h4>Kalkulation: {selectedProject.name}</h4>
                </div>
                <div className="actions-right">
                  <button type="button" onClick={handleProjectStaffPrint} className="btn secondary-btn">
                    Mitarbeiter-Auszug drucken
                  </button>
                  <button onClick={handlePrint} className="btn primary-btn" disabled={isPreparingPrint}>
                    {isPreparingPrint ? 'Vorbereitung…' : 'Drucken'}
                  </button>
                </div>
              </div>

              {/* Projektinfo */}
              <div className="project-info-section">
                <h4>Projektinformationen</h4>
                <div className="project-info-grid">
                  <div className="info-item">
                    <span className="info-label">Projekt:</span>
                    <span className="info-value">{selectedProject.name}</span>
                  </div>
                  {selectedProject.client && (
                    <div className="info-item">
                      <span className="info-label">Kunde:</span>
                      <span className="info-value">{selectedProject.client}</span>
                    </div>
                  )}
                  {(selectedProject.address || selectedProject.location) && (
                    <div className="info-item">
                      <span className="info-label">Adresse:</span>
                      <span className="info-value">{selectedProject.address || selectedProject.location}</span>
                    </div>
                  )}
                  {useTimeFilter && (
                    <div className="info-item">
                      <span className="info-label">Zeitraum:</span>
                      <span className="info-value">{formatPeriod()}</span>
                    </div>
                  )}
                </div>
                {selectedProject.description && (
                  <div className="project-description">
                    <span className="info-label">Beschreibung:</span>
                    <p>{selectedProject.description}</p>
                  </div>
                )}
              </div>

              {/* Personalkosten */}
              <div className="cost-section">
                <h4>Personalkosten</h4>
                {employeeSummaries.length === 0 ? (
                  <p className="no-data">Keine Zeiteinträge vorhanden</p>
                ) : (
                  <>
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Mitarbeiter</th>
                        <th className="number-cell">Stunden</th>
                        <th className="number-cell">Stundensatz</th>
                        <th className="number-cell">Kosten (Verrechnung)</th>
                        {hasAnyEmployeeCostRate() && (
                          <>
                            <th className="number-cell">Einkauf</th>
                            <th className="number-cell">Marge</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {employeeSummaries.map(emp => {
                        const margin = emp.hasCostRate ? emp.totalCost - emp.totalPurchaseCost : null
                        return (
                        <tr key={emp.employeeId}>
                          <td>{emp.employeeName}</td>
                          <td className="number-cell">{emp.totalHours.toFixed(2)} h</td>
                          <td className="number-cell">{formatCurrency(emp.hourlyRate)}</td>
                          <td className="number-cell">{formatCurrency(emp.totalCost)}</td>
                          {hasAnyEmployeeCostRate() && (
                            <>
                              <td className="number-cell">
                                {emp.hasCostRate ? formatCurrency(emp.totalPurchaseCost) : '—'}
                              </td>
                              <td className={`number-cell ${margin != null && margin < 0 ? 'margin-negative' : 'margin-positive'}`}>
                                {margin != null ? formatCurrency(margin) : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="subtotal-row">
                        <td colSpan={3}><strong>Summe Personalkosten:</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getEmployeeTotalCost())}</strong></td>
                        {hasAnyEmployeeCostRate() && (
                          <>
                            <td className="number-cell"><strong>{formatCurrency(getEmployeeTotalPurchaseCost())}</strong></td>
                            <td className="number-cell"><strong>{formatCurrency(getEmployeeTotalMargin())}</strong></td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                  {hasAnyEmployeeCostRate() && (
                    <p className="material-margin-note">
                      Marge = Kosten (Verrechnung) − Einkauf (interner Kostensatz). Nur Mitarbeiter mit
                      hinterlegtem Kostensatz fließen in Einkauf/Marge ein.
                    </p>
                  )}
                  </>
                )}
              </div>

              {/* Materialkosten (gebuchtes Verbrauchsmaterial) */}
              <div className="cost-section">
                <h4>Materialkosten</h4>
                {getProjectMaterialSummaries().length === 0 ? (
                  <p className="no-data">Kein gebuchtes Material vorhanden</p>
                ) : (
                  <>
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th className="number-cell">Menge</th>
                        <th className="number-cell">Verkauf (Kosten)</th>
                        <th className="number-cell">Einkauf</th>
                        <th className="number-cell">Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getProjectMaterialSummaries().map(mat => {
                        const margin = mat.hasPurchase ? mat.cost - mat.purchaseCost : null
                        return (
                        <tr key={mat.key}>
                          <td>{mat.name}</td>
                          <td className="number-cell">
                            {mat.quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                            {mat.unitLabel ? ` ${mat.unitLabel}` : ''}
                          </td>
                          <td className="number-cell">
                            {mat.unitPriceEur != null ? formatCurrency(mat.cost) : '—'}
                          </td>
                          <td className="number-cell">
                            {mat.hasPurchase ? formatCurrency(mat.purchaseCost) : '—'}
                          </td>
                          <td className={`number-cell ${margin != null && margin < 0 ? 'margin-negative' : 'margin-positive'}`}>
                            {margin != null ? formatCurrency(margin) : '—'}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="subtotal-row">
                        <td colSpan={2}><strong>Summen:</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getMaterialTotalCost())}</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getMaterialTotalPurchaseCost())}</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getMaterialTotalMargin())}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="material-margin-note">
                    Marge = Verkauf − Einkauf. Nur Positionen mit im Material hinterlegtem
                    Einkaufspreis fließen in Einkauf/Marge ein.
                  </p>
                  </>
                )}
              </div>

              {/* Gesamtsumme */}
              <div className="total-cost-section">
                <div className="total-cost-box">
                  <span className="total-label">Gesamtkosten Projekt:</span>
                  <span className="total-value">{formatCurrency(getProjectTotalCost())}</span>
                </div>
                {getMaterialTotalPurchaseCost() > 0 && (
                  <div className="total-cost-box total-cost-box-margin">
                    <span className="total-label">Materialmarge (Verkauf − Einkauf):</span>
                    <span className="total-value">{formatCurrency(getMaterialTotalMargin())}</span>
                  </div>
                )}
                {hasAnyEmployeeCostRate() && (
                  <div className="total-cost-box total-cost-box-margin">
                    <span className="total-label">Personalmarge (Verrechnung − Kostensatz):</span>
                    <span className="total-value">{formatCurrency(getEmployeeTotalMargin())}</span>
                  </div>
                )}
                {(hasAnyEmployeeCostRate() || getMaterialTotalPurchaseCost() > 0) && (
                  <div className="total-cost-box total-cost-box-margin">
                    <span className="total-label">Gesamtmarge (Personal + Material):</span>
                    <span className="total-value">
                      {formatCurrency(getEmployeeTotalMargin() + getMaterialTotalMargin())}
                    </span>
                  </div>
                )}
              </div>

              {/* Tagesweise Dokumentation & Medien */}
              <div className="project-day-report-section">
                <h4>Berichte & Dokumentation nach Tag</h4>
                <p className="project-day-intro">
                  Pro Kalendertag: geleistete Gesamtstunden, ausklappbare Stunden je Mitarbeiter, Texte aus
                  Stempelungen sowie Fotos und Dokumente mit Datum.
                </p>
                {projectJournalDays.length === 0 &&
                projectPhotos.length === 0 &&
                projectDocuments.length === 0 ? (
                  <p className="no-data">Keine Tagesdaten oder Medien für dieses Projekt.</p>
                ) : (
                  <div className="project-day-list">
                    {projectJournalDays.map(day => {
                      const { photos: dayPhotos, docs: dayDocs } = filesForProjectDay(day.dateKey)
                      const expanded = expandedProjectDays.has(day.dateKey)
                      return (
                        <div key={day.dateKey} className="project-day-card">
                          <div className="project-day-header">
                            <div className="project-day-title">
                              <strong>{day.dateLabel}</strong>
                              <span className="project-day-hours">
                                Σ {formatHoursMinutes(day.totalHours)} (alle Mitarbeiter)
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn secondary-btn project-day-expand"
                              onClick={() => toggleProjectDayExpanded(day.dateKey)}
                              aria-expanded={expanded}
                            >
                              {expanded ? '▼' : '▶'} Stunden je Mitarbeiter
                            </button>
                          </div>

                          <table
                            className={`project-day-emp-table${expanded ? '' : ' screen-collapsed'}`}
                          >
                              <thead>
                                <tr>
                                  <th>Mitarbeiter</th>
                                  <th className="number-cell">Stunden</th>
                                </tr>
                              </thead>
                              <tbody>
                                {day.byEmployee.map(row => (
                                  <tr key={row.employeeId}>
                                    <td>{row.name}</td>
                                    <td className="number-cell">{formatHoursMinutes(row.hours)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                          <div className="project-day-text-block">
                            <h5>Schriftliche Einträge &amp; Kommentare</h5>
                            {day.entries.length === 0 ? (
                              <p className="muted-small">Keine abgeschlossenen Stempelungen an diesem Tag.</p>
                            ) : (
                              <ul className="project-entry-text-list">
                                {day.entries.map(entry => {
                                  const empName = getEmployeeDisplayName(entry.employeeId)
                                  const cin = formatTimeForInput(roundTimeToStep(convertToDate(entry.clockInTime)))
                                  const cout = formatTimeForInput(roundTimeToStep(convertToDate(entry.clockOutTime)))
                                  const note = (entry.notes || '').trim()
                                  const live = entry.liveDocumentation || []
                                  const hasReport = !!note || live.length > 0
                                  return (
                                    <li
                                      key={entry.id}
                                      className="project-entry-text-item project-entry-text-item--clickable"
                                      role="button"
                                      tabIndex={0}
                                      title="Bericht öffnen"
                                      onClick={() => setJournalEntryDetail({ entry, dayLabel: day.dateLabel })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          setJournalEntryDetail({ entry, dayLabel: day.dateLabel })
                                        }
                                      }}
                                    >
                                      <div className="pet-head">
                                        <strong>{empName}</strong>
                                        <span className="pet-head-right">
                                          <span className="muted-small">
                                            {cin}–{cout}
                                          </span>
                                          <span className="pet-chevron no-print" aria-hidden="true">›</span>
                                        </span>
                                      </div>
                                      {note ? (
                                        <p className="pet-notes">{note}</p>
                                      ) : (
                                        !hasReport && (
                                          <p className="pet-notes pet-notes--empty">Kein schriftlicher Bericht</p>
                                        )
                                      )}
                                      {live.length > 0 && (
                                        <ul className="pet-live-list">
                                          {live.map((block, bi) => (
                                            <li key={bi}>
                                              <span className="muted-small">{block.addedByName || 'Team'}:</span>{' '}
                                              {(block.notes || '').trim() ||
                                                `( ${block.photoCount || 0} Fotos, ${block.documentCount || 0} Dok.)`}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>

                          {(dayPhotos.length > 0 || dayDocs.length > 0) && (
                            <div className="project-day-media-block">
                              {dayPhotos.length > 0 && (
                                <>
                                  <h5>Fotos ({dayPhotos.length})</h5>
                                  <div className="photo-grid compact-grid">
                                    {dayPhotos.map((photo, idx) => {
                                      const imgSrc = getImageSrc(photo)
                                      return (
                                        <div
                                          key={photo.id || idx}
                                          className="photo-card"
                                          onClick={() => setLightboxImage(photo)}
                                        >
                                          {imgSrc ? (
                                            <img
                                              src={imgSrc}
                                              alt={photo.fileName || 'Foto'}
                                              className="photo-thumbnail"
                                            />
                                          ) : (
                                            <div className="photo-placeholder">Kein Bild</div>
                                          )}
                                          <div className="photo-info">
                                            {(photo.notes || photo.imageComment) && (
                                              <span className="photo-desc">
                                                {photo.notes || photo.imageComment}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                              {dayDocs.length > 0 && (
                                <>
                                  <h5>Dokumente ({dayDocs.length})</h5>
                                  <div className="document-list">
                                    {dayDocs.map((doc, idx) => {
                                      const imgSrc = getImageSrc(doc)
                                      return (
                                        <div
                                          key={doc.id || idx}
                                          className="document-card"
                                          onClick={() => setLightboxImage(doc)}
                                        >
                                          {imgSrc ? (
                                            <img
                                              src={imgSrc}
                                              alt={doc.fileName || 'Dokument'}
                                              className="document-thumbnail"
                                            />
                                          ) : (
                                            <div className="document-placeholder">Dok.</div>
                                          )}
                                          <div className="document-info">
                                            <span className="document-name">{doc.fileName || 'Dokument'}</span>
                                            {(doc.notes || doc.imageComment) && (
                                              <span className="document-desc">
                                                {doc.notes || doc.imageComment}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Hinweis nur wenn es Medien gibt, aber keine passenden Zeiteinträge im Filter */}
                  </div>
                )}
              </div>

              {/* Druck-Footer */}
              <div className="print-footer print-only">
                <p>Erstellt am: {new Date().toLocaleDateString('de-DE')} um {new Date().toLocaleTimeString('de-DE')}</p>
              </div>
            </div>
          )}

          {/* Lightbox */}
          {lightboxImage && (
            <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
              <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                <button className="lightbox-close" onClick={() => setLightboxImage(null)}>×</button>
                <img src={getImageSrc(lightboxImage)} alt={lightboxImage.fileName || ''} className="lightbox-image" />
                {(lightboxImage.notes || lightboxImage.imageComment || lightboxImage.fileName) && (
                  <div className="lightbox-info">
                    {lightboxImage.fileName && <p className="lightbox-filename">{lightboxImage.fileName}</p>}
                    {(lightboxImage.notes || lightboxImage.imageComment) && (
                      <p className="lightbox-description">{lightboxImage.notes || lightboxImage.imageComment}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {journalEntryDetail && (() => {
            const { entry, dayLabel } = journalEntryDetail
            const empName = getEmployeeDisplayName(entry.employeeId)
            const cin = formatTimeForInput(roundTimeToStep(convertToDate(entry.clockInTime)))
            const cout = formatTimeForInput(roundTimeToStep(convertToDate(entry.clockOutTime)))
            const note = (entry.notes || '').trim()
            const live = entry.liveDocumentation || []
            const hasContent = !!note || live.length > 0
            return (
              <div className="journal-report-overlay" onClick={() => setJournalEntryDetail(null)}>
                <div className="journal-report-modal" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="journal-report-close"
                    onClick={() => setJournalEntryDetail(null)}
                    aria-label="Schließen"
                  >
                    ×
                  </button>
                  <div className="journal-report-head">
                    <h3>{empName}</h3>
                    <p className="muted-small">{dayLabel} · {cin}–{cout}</p>
                  </div>

                  {!hasContent && (
                    <p className="journal-report-empty">Kein schriftlicher Bericht erfasst.</p>
                  )}

                  {note && (
                    <div className="journal-report-section">
                      <h4>Notiz zur Arbeit</h4>
                      <p className="journal-report-text">{note}</p>
                    </div>
                  )}

                  {live.length > 0 && (
                    <div className="journal-report-section">
                      <h4>Live-Dokumentation</h4>
                      <ul className="journal-report-live-list">
                        {live.map((block, bi) => {
                          const blockText = (block.notes || '').trim()
                          return (
                            <li key={bi}>
                              <span className="muted-small">{block.addedByName || 'Team'}:</span>{' '}
                              {blockText || `(${block.photoCount || 0} Fotos, ${block.documentCount || 0} Dok.)`}
                              {blockText && (block.photoCount || block.documentCount) ? (
                                <span className="muted-small">
                                  {' '}({block.photoCount || 0} Fotos, {block.documentCount || 0} Dok.)
                                </span>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

export default ReportsTab
