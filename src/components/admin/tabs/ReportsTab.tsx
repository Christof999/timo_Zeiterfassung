import { useState, useEffect, useRef } from 'react'
import { DataService } from '../../../services/dataService'
import type { Employee, TimeEntry, Project, FileUpload, TimeReportSettlement, MaterialCredit, MaterialType } from '../../../types'
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
  VACATION_WORK_HOURS_LABEL,
  convertToDate,
  formatDateForDisplay,
  getDateKey,
  getApprovedVacationDates,
  formatTimeForInput,
  formatHoursMinutes,
  calculateWorkHours,
  msToMinutes,
  entryCreditMinutes,
  workMinutesFromParts,
  minutesToHoursLabel,
  workMinutesFromOriginalEntry,
  formatCurrency
} from './reports/reportUtils'
import { buildEmployeePrintHtml, buildProjectStaffPrintHtml } from './reports/printHtml'
import SearchableSelect from '../../SearchableSelect'
import '../../../styles/AdminTabs.css'
import '../../../styles/ReportPrint.css'

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
      : ['employee', 'project']

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
  useEffect(() => {
    setHasSearched(false)
    setReportEntries([])
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

  // ==================== MITARBEITER-BERICHT ====================
  const handleEmployeeSearch = async () => {
    if (!selectedEmployeeId) {
      toast.error('Bitte wählen Sie einen Mitarbeiter aus')
      return
    }
    if (!startDate || !endDate) {
      toast.error('Bitte wählen Sie einen Zeitraum aus')
      return
    }

    setIsLoading(true)
    setHasSearched(true)

    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      // Zeitraum serverseitig vorfiltern; der Filter unten bleibt als
      // Absicherung (die Query darf eine Obermenge liefern).
      const [allEntries, leaveRequests] = await Promise.all([
        DataService.getTimeEntriesByEmployeeId(selectedEmployeeId, { from: start, to: end }),
        DataService.getLeaveRequestsByEmployee(selectedEmployeeId)
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
          ? await DataService.getFileUploadsByTimeEntryIds(entryIds, { includeBinary: true })
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
      const vacationEntries: ReportEntry[] = getApprovedVacationDates(
        leaveRequests,
        start,
        end,
        occupiedTimeEntryDates
      ).map(({ date, request }) => {
        const dateKey = getDateKey(date)
        const syntheticClockIn = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0, 0, 0)
        const syntheticClockOut = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, 0, 0, 0)
        const reason = (request.reason || '').trim()
        const notes = reason
          ? `Genehmigter Urlaub (${VACATION_WORK_HOURS_LABEL} Arbeitsstunden): ${reason}`
          : `Genehmigter Urlaub (${VACATION_WORK_HOURS_LABEL} Arbeitsstunden)`
        const originalEntry: TimeEntry = {
          id: `vacation-${request.id || dateKey}-${dateKey}`,
          employeeId: selectedEmployeeId,
          projectId: 'vacation',
          clockInTime: syntheticClockIn,
          clockOutTime: syntheticClockOut,
          pauseTotalTime: 0,
          notes,
          isVacationDay: true
        }

        return {
          id: originalEntry.id,
          originalEntry,
          source: 'leave-request',
          date: formatDateForDisplay(date),
          dateRaw: date,
          dateKey,
          projectId: 'vacation',
          projectName: 'Urlaub',
          clockIn: '',
          clockOut: '',
          pauseMinutes: 0,
          pauseMs: 0,
          workHours: VACATION_WORK_HOURS_LABEL,
          notes,
          originalNotes: notes,
          isEdited: false,
          isReadOnly: true,
          holidayName: getBavariaHolidayName(date)
        }
      })

      const reportRows = [...entries, ...vacationEntries].sort((a, b) => {
        const ta = a.dateRaw?.getTime() || 0
        const tb = b.dateRaw?.getTime() || 0
        if (ta !== tb) return ta - tb
        if (a.source !== b.source) return a.source === 'time-entry' ? -1 : 1
        return a.id.localeCompare(b.id)
      })

      setReportEntries(reportRows)
      const emp = employees.find(e => e.id === selectedEmployeeId)
      setSelectedEmployeeName(
        emp ? (emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()) : ''
      )

      const settlement = await DataService.getTimeReportSettlement(selectedEmployeeId, startDate, endDate)
      setEmployeeSettlement(settlement)
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
        projectName: getProjectName(original.projectId),
        clockIn, clockOut, pauseMinutes, pauseMs,
        notes: updated[index].originalNotes,
        workHours: calculateWorkHours(clockIn, clockOut, pauseMinutes, entryCreditMinutes(original)),
        isEdited: false
      }
      return updated
    })
  }

  const calculateTotalHours = (): string => {
    let totalMinutes = 0
    reportEntries.forEach(entry => {
      if (entry.workHours && entry.workHours !== '-') {
        const [h, m] = entry.workHours.split(':').map(Number)
        totalMinutes += h * 60 + m
      }
    })
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

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
    const lines = buildSettlementLinesFromEntries()
    const rawTotalMinutes = lines.reduce((s, l) => s + l.rawMinutes, 0)
    const correctedTotalMinutes = lines.reduce((s, l) => s + l.correctedMinutes, 0)
    const paidOutMinutes = lines.reduce((s, l) => s + l.paidOutMinutes, 0)

    setIsSavingSettlement(true)
    try {
      await DataService.saveTimeReportSettlement({
        employeeId: selectedEmployeeId,
        periodStart: startDate,
        periodEnd: endDate,
        paidOutMinutes,
        rawTotalMinutes,
        correctedTotalMinutes,
        lines
      })
      toast.success(
        paidOutMinutes > 0
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
      const employeeMap = new Map<string, { hours: number; rate: number; name: string }>()
      
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
        const employeeName = employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || entry.employeeId
        
        const existing = employeeMap.get(entry.employeeId)
        if (existing) {
          existing.hours += hours
        } else {
          employeeMap.set(entry.employeeId, { hours, rate: hourlyRate, name: employeeName })
        }
      })

      const empSummaries: EmployeeSummary[] = Array.from(employeeMap.entries()).map(([id, data]) => ({
        employeeId: id,
        employeeName: data.name,
        totalHours: Math.round(data.hours * 100) / 100,
        hourlyRate: data.rate,
        totalCost: Math.round(data.hours * data.rate * 100) / 100
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
      printWindow.document.write(
        buildEmployeePrintHtml({
          reportEntries,
          startDate,
          endDate,
          employeeName: selectedEmployeeName,
          periodLabel: formatPeriod()
        })
      )
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

  const hasEdits = reportEntries.some(e => e.isEdited)
  const settlementLinesPreview =
    reportType === 'employee' && reportEntries.length > 0 ? buildSettlementLinesFromEntries() : []
  const remainderHasTimeChange = settlementLinesPreview.some(l => l.rawMinutes !== l.correctedMinutes)
  const remainderHasShortening = settlementLinesPreview.some(l => l.paidOutMinutes > 0)
  const isEmployeeReportEnabled = availableReportTypes.includes('employee')
  const isProjectReportEnabled = availableReportTypes.includes('project')
  const showReportTypeTabs = isEmployeeReportEnabled && isProjectReportEnabled

  const projectJournalDays =
    reportType === 'project' && hasSearched && selectedProject ? buildProjectDayBlocks() : []

  return (
    <div className="reports-tab">
      {/* Tab-Auswahl */}
      {showReportTypeTabs && (
        <div className="report-type-tabs no-print">
          <button
            className={`report-type-btn ${reportType === 'employee' ? 'active' : ''}`}
            onClick={() => setReportType('employee')}
          >
            Mitarbeiter-Zeitauswertung
          </button>
          <button
            className={`report-type-btn ${reportType === 'project' ? 'active' : ''}`}
            onClick={() => setReportType('project')}
          >
            Projekt-Nachkalkulation
          </button>
        </div>
      )}

      {/* ==================== MITARBEITER-BERICHT ==================== */}
      {isEmployeeReportEnabled && reportType === 'employee' && (
        <>
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
            <button onClick={handleEmployeeSearch} className="btn primary-btn search-btn" disabled={isLoading}>
              {isLoading ? 'Lädt...' : 'Auswertung laden'}
            </button>
          </div>

          {hasSearched && (
            <div className="report-content">
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
                  {hasEdits && <span className="edit-hint">Es gibt temporäre Änderungen (nur für Druck)</span>}
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
                    <button onClick={handleEmployeeSearch} className="btn secondary-btn">
                      Zurücksetzen
                    </button>
                  )}
                  <button onClick={handlePrint} className="btn primary-btn" disabled={isPreparingPrint}>
                    {isPreparingPrint ? 'Vorbereitung…' : 'Drucken'}
                  </button>
                </div>
              </div>

              <div className="edit-notice no-print">
                <p>
                  <strong>Hinweis:</strong> Änderungen sind nur temporär für den Druck, bis Sie sie mit „Korrektur
                  abrechnen & speichern“ festhalten. „Restliche Stunden“ zeigt die pro Tag gekürzte Zeit (Rohzeit minus
                  korrigierte Zeit).
                </p>
              </div>

              {reportEntries.length === 0 ? (
                <p className="no-data">Keine Zeiteinträge gefunden</p>
              ) : employeeReportView === 'remainder' ? (
                <div className="report-table-container">
                  {getRemainderLines().length === 0 ? (
                    <div className="no-data remainder-empty-hint">
                      {!remainderHasTimeChange && hasEdits ? (
                        <p>
                          Sie haben nur den <strong>Projektnamen</strong> angepasst — die Stempelzeiten sind unverändert.
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
                      {reportEntries.map((entry, index) => (
                        <tr
                          key={entry.id}
                          className={[
                            entry.isEdited ? 'edited-row' : '',
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
                            <input
                              type="text"
                              value={entry.projectName}
                              onChange={e => handleFieldChange(index, 'projectName', e.target.value)}
                              className="inline-edit"
                              disabled={entry.isReadOnly}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              value={entry.clockIn}
                              onChange={e => handleFieldChange(index, 'clockIn', e.target.value)}
                              className="inline-edit time-input"
                              disabled={entry.isReadOnly}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              value={entry.clockOut}
                              onChange={e => handleFieldChange(index, 'clockOut', e.target.value)}
                              className="inline-edit time-input"
                              disabled={entry.isReadOnly}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={entry.pauseMinutes}
                              onChange={e => handleFieldChange(index, 'pauseMinutes', e.target.value)}
                              className="inline-edit pause-input"
                              disabled={entry.isReadOnly}
                            />
                          </td>
                          <td className="comment-cell">{entry.notes || '—'}</td>
                          <td className="hours-cell">{entry.workHours}</td>
                          <td className="no-print actions-cell">
                            {entry.isEdited && (
                              <button type="button" onClick={() => handleResetEntry(index)} className="reset-btn">
                                Zurück
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td colSpan={6}>
                          <strong>Gesamt:</strong>
                        </td>
                        <td className="hours-cell">
                          <strong>{calculateTotalHours()}</strong>
                        </td>
                        <td className="no-print"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="print-footer print-only">
                <div className="signature-line">
                  <div className="signature-box"><p>Unterschrift Mitarbeiter</p><div className="line"></div></div>
                  <div className="signature-box"><p>Unterschrift Arbeitgeber</p><div className="line"></div></div>
                </div>
              </div>
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
                  options={projects.map(proj => ({
                    value: proj.id,
                    label: proj.client ? `${proj.name} (${proj.client})` : proj.name || proj.id
                  }))}
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
                  <table className="cost-table">
                    <thead>
                      <tr>
                        <th>Mitarbeiter</th>
                        <th className="number-cell">Stunden</th>
                        <th className="number-cell">Stundensatz</th>
                        <th className="number-cell">Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeSummaries.map(emp => (
                        <tr key={emp.employeeId}>
                          <td>{emp.employeeName}</td>
                          <td className="number-cell">{emp.totalHours.toFixed(2)} h</td>
                          <td className="number-cell">{formatCurrency(emp.hourlyRate)}</td>
                          <td className="number-cell">{formatCurrency(emp.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="subtotal-row">
                        <td colSpan={3}><strong>Summe Personalkosten:</strong></td>
                        <td className="number-cell"><strong>{formatCurrency(getEmployeeTotalCost())}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
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
