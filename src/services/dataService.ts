import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  limit,
  orderBy,
  runTransaction,
  documentId,
  Timestamp,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebaseConfig'
import { authReady, convertToDate as sharedConvertToDate } from './data/shared'
import { regularMinutesForDateKey, regularMinutesForRange } from '../utils/regularWorkTime'
import * as session from './data/session'
import * as customers from './data/customers'
import * as vehicles from './data/vehicles'
import * as materials from './data/materials'
import * as employees from './data/employees'
import * as projects from './data/projects'
import * as leave from './data/leave'
import * as settlements from './data/settlements'
import * as overtimeSettlements from './data/overtimeSettlements'
import * as overtimeBroadcast from './data/overtimeBroadcast'
import * as hero from './data/hero'
import * as dashboard from './data/dashboard'
import type {
  Employee,
  Project,
  Customer,
  TimeEntry,
  TimeEntryMaterialUsage,
  Vehicle,
  VehicleUsage,
  FileUpload,
  LeaveRequest,
  MaterialType,
  MaterialCredit,
  TimeReportSettlement,
  OvertimeSettlement,
  HeroIntegrationConfig,
  HeroSyncLogEntry,
  DashboardWidgetInstance
} from '../types'
import { formatDateForInputLocal } from '../utils/dateUtils'
import { workedMinutesForMonth } from '../utils/monthlyWorkedMinutes'
import { withTimeout } from '../utils/withTimeout'
import { getFileImageSrc } from '../utils/fileImageSrc'
import { toFileUploadRef } from '../utils/fileUploadRef'
import { sanitizeTimeEntryForRead } from '../utils/sanitizeTimeEntry'
import { estimateReturnTravel, getReturnTravelCreditMs } from '../utils/returnTravel'
import { roundTimeToStep, roundedSpanMs } from '../utils/timeRounding'

const isDevMode = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV

/** Optionen beim Laden von Datei-Uploads — bei includeBinary=false bleibt Base64 außen vor. */
export type FileUploadLoadOptions = { includeBinary?: boolean }

/**
 * Optionaler Zeitraumfilter für Zeiteintrag-Queries (bezogen auf clockInTime).
 * Wird serverseitig gefiltert (spart Reads und Ladezeit bei wachsender Historie).
 * WICHTIG: Die Methoden dürfen eine Obermenge liefern (Fallback ohne Filter,
 * z. B. bei noch nicht deploytem Index) — Aufrufer filtern daher weiterhin
 * clientseitig nach.
 */
export type TimeEntryDateRange = { from?: Date; to?: Date }

// Timeouts für die Bild-/Upload-Pipeline — verhindern endloses „Speichere…“ bei schlechtem Netz.
const STORAGE_UPLOAD_TIMEOUT_MS = 25_000
const IMAGE_PREPARE_TIMEOUT_MS = 90_000
const IMAGE_DECODE_TIMEOUT_MS = 30_000
const FIRESTORE_WRITE_TIMEOUT_MS = 45_000

/** Firestore-Maximum pro String-Feld (base64Data) — etwas Puffer unter 1.048.487 Bytes */
const FIRESTORE_MAX_BASE64_BYTES = 1_000_000

/** Keine Firestore-Dokumente (Platzhalter aus alter Offline-/Client-Logik). */
function isPlaceholderFileUploadId(id: string): boolean {
  const t = id.trim().toLowerCase()
  return (
    t.startsWith('local_') ||
    t.startsWith('temp_') ||
    t.startsWith('mock_') ||
    t.startsWith('fake_')
  )
}

/** IDs aus verschachtelten Arrays/Objekten (sitePhotos, liveDocumentation, …) — nur id-ähnliche Felder, kein Volltext. */
function collectFileReferenceIds(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 14) return
  if (value == null) return
  if (typeof value === 'string') {
    const t = value.trim()
    if (t.length >= 8 && t.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(t) && !isPlaceholderFileUploadId(t)) {
      into.add(t)
    }
    return
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.add(String(value))
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectFileReferenceIds(item, into, depth + 1))
    return
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const key of ['id', 'fileId', 'uploadId', 'docId', 'fileUploadId']) {
      const v = o[key]
      if (typeof v === 'string' && v.trim() && !isPlaceholderFileUploadId(v.trim())) into.add(v.trim())
      if (typeof v === 'number' && Number.isFinite(v)) into.add(String(v))
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'notes' || k === 'imageComment' || k === 'addedByName' || k === 'base64Data' || k === 'mimeType') {
        continue
      }
      if (v !== null && typeof v === 'object') collectFileReferenceIds(v, into, depth + 1)
    }
  }
}

class DataServiceClass {
  // Auth-Bereitschaft kommt zentral aus data/shared.ts
  private authReadyPromise: Promise<void> = authReady

  /** Einheitliche Abbildung fileUploads-Dokument → FileUpload (gleiche Base64-/URL-Logik wie getFileUploads). */
  private fileUploadFromDocData(
    docId: string,
    data: Record<string, unknown>,
    opts?: {
      projectIdFallback?: string
      fileTypeFallback?: string
      includeBinary?: boolean
    }
  ): FileUpload {
    const uploadTimeRaw = data.uploadTime
    const uploadTime =
      uploadTimeRaw instanceof Timestamp
        ? uploadTimeRaw.toDate()
        : uploadTimeRaw instanceof Date
          ? uploadTimeRaw
          : (uploadTimeRaw as any)?.toDate?.() || new Date((uploadTimeRaw as any) || Date.now())

    const includeBinary = opts?.includeBinary === true
    let base64 = ''
    let fileUrl = String(data.url || data.filePath || '')
    if (includeBinary) {
      base64 = String(data.base64Data || data.base64String || data.base64 || '')
      if (fileUrl.startsWith('data:')) {
        const parts = fileUrl.split(',')
        if (parts.length > 1) base64 = parts[1]
        fileUrl = ''
      }
      if (!base64 && typeof data.mimeType === 'string' && data.mimeType.includes(',')) {
        const parts = data.mimeType.split(',')
        if (parts.length > 1) base64 = parts[1]
      }
    } else if (fileUrl.startsWith('data:')) {
      fileUrl = ''
    }

    let mimeType = String(data.mimeType || data.contentType || '')
    if (mimeType.startsWith('data:')) {
      const match = mimeType.match(/^data:([^;,]+)/)
      if (match) mimeType = match[1]
    }

    const storagePathRaw = data.storagePath || data.storage_path
    const storagePath =
      typeof storagePathRaw === 'string' && storagePathRaw.trim()
        ? storagePathRaw.trim()
        : undefined

    return {
      id: docId,
      fileName: String(data.fileName || data.name || ''),
      filePath: fileUrl,
      fileType: String(data.fileType || data.type || opts?.fileTypeFallback || 'construction_site'),
      projectId: String(data.projectId || opts?.projectIdFallback || ''),
      employeeId: String(data.employeeId || ''),
      timeEntryId: String(data.timeEntryId || ''),
      uploadTime: uploadTime || new Date(),
      notes: String(data.notes || data.comment || ''),
      imageComment: String(data.imageComment || data.comment || ''),
      base64Data: base64,
      mimeType,
      storagePath
    } as FileUpload
  }

  /** Nur IDs, für die ein fileUploads-Dokument existiert (vermeidet Fehler bei Platzhalter-/Offline-IDs). */
  private async filterExistingFileUploadDocIds(ids: string[]): Promise<string[]> {
    const out: string[] = []
    for (const rawId of ids) {
      const id = rawId?.trim()
      if (!id || isPlaceholderFileUploadId(id)) continue
      try {
        const ref = doc(db, 'fileUploads', id)
        const snap = await getDoc(ref)
        if (snap.exists()) out.push(id)
      } catch {
        /* skip */
      }
    }
    return out
  }

  get authReady() {
    return this.authReadyPromise
  }

  // ==================== SESSION (data/session.ts) ====================
  async getCurrentUser(): Promise<Employee | null> {
    return session.getCurrentUser()
  }

  setCurrentUser(user: Employee | null) {
    session.setCurrentUser(user)
  }

  clearCurrentUser() {
    session.clearCurrentUser()
  }

  authenticateEmployee(username: string, password: string): Promise<Employee | null> {
    return session.authenticateEmployee(username, password)
  }

  // ==================== PROJEKTE (data/projects.ts) ====================
  getActiveProjects(): Promise<Project[]> {
    return projects.getActiveProjects()
  }

  getProjectById(projectId: string): Promise<Project | null> {
    return projects.getProjectById(projectId)
  }

  // Time Entry Management
  async getCurrentTimeEntry(employeeId: string): Promise<TimeEntry | null> {
    await this.authReadyPromise
    try {
      if (!employeeId) {
        return null
      }
      
      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(
        timeEntriesRef,
        where('employeeId', '==', employeeId),
        where('clockOutTime', '==', null)
      )
      
      const snapshot = await getDocs(q)
      if (!snapshot.empty) {
        const activeEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeEntry))
        activeEntries.sort((a, b) => {
          const aDate = a.clockInTime instanceof Timestamp
            ? a.clockInTime.toDate()
            : new Date(a.clockInTime)
          const bDate = b.clockInTime instanceof Timestamp
            ? b.clockInTime.toDate()
            : new Date(b.clockInTime)
          return bDate.getTime() - aDate.getTime()
        })

        if (isDevMode && activeEntries.length > 1) {
          console.warn(`Mehrere offene Zeiteinträge für Mitarbeiter ${employeeId} gefunden:`, activeEntries.length)
        }

        return sanitizeTimeEntryForRead(activeEntries[0])
      }
      return null
    } catch (error) {
      console.error('Fehler beim Abrufen des aktuellen Zeiteintrags:', error)
      return null
    }
  }

  async getTimeEntriesByEmployeeId(employeeId: string, range?: TimeEntryDateRange): Promise<TimeEntry[]> {
    return this.queryTimeEntries('employeeId', employeeId, range)
  }

  /**
   * Die letzten Zeiteinträge eines Mitarbeiters (neueste zuerst), serverseitig
   * begrenzt. Fallback: alle Einträge laden und clientseitig sortieren/kürzen
   * (z. B. solange der Composite-Index noch nicht deployt ist).
   */
  async getRecentTimeEntriesByEmployeeId(employeeId: string, count: number): Promise<TimeEntry[]> {
    await this.authReadyPromise
    const timeEntriesRef = collection(db, 'timeEntries')
    try {
      const q = query(
        timeEntriesRef,
        where('employeeId', '==', employeeId),
        orderBy('clockInTime', 'desc'),
        limit(count)
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) =>
        sanitizeTimeEntryForRead({ id: doc.id, ...doc.data() } as TimeEntry)
      )
    } catch (error) {
      console.warn('Sortierte Query fehlgeschlagen (Index fehlt?) – lade ungefiltert:', error)
      const all = await this.getTimeEntriesByEmployeeId(employeeId)
      return all
        .sort(
          (a, b) =>
            this.convertToDate(b.clockInTime).getTime() - this.convertToDate(a.clockInTime).getTime()
        )
        .slice(0, count)
    }
  }

  /**
   * Zeiteinträge über ein Gleichheitsfeld (employeeId/projectId).
   *
   * WICHTIG: Bewusst KEINE serverseitige clockInTime-Bereichsfilterung mehr.
   * Grund: `where('clockInTime', '>=', Timestamp)` findet nur Einträge, deren
   * clockInTime ein echter Firestore-Timestamp ist. Alt-/Sonderdaten speichern
   * clockInTime teils als einfaches `{seconds, nanoseconds}`-Objekt — die werden
   * von Firestore bei einem Timestamp-Bereichsfilter ignoriert (und da die Query
   * andere Treffer liefert, würden solche Einträge lautlos aus den Berichten
   * fallen). Der `range`-Parameter bleibt für die Aufrufer erhalten, wird hier
   * aber nicht mehr für die Query genutzt: Die Aufrufer filtern den Zeitraum
   * ohnehin clientseitig über convertToDate (das alle Timestamp-Formate liest).
   */
  private async queryTimeEntries(
    field: 'employeeId' | 'projectId',
    value: string,
    _range?: TimeEntryDateRange
  ): Promise<TimeEntry[]> {
    await this.authReadyPromise
    const timeEntriesRef = collection(db, 'timeEntries')
    try {
      const snapshot = await getDocs(query(timeEntriesRef, where(field, '==', value)))
      return snapshot.docs.map((doc) =>
        sanitizeTimeEntryForRead({ id: doc.id, ...doc.data() } as TimeEntry)
      )
    } catch (error) {
      console.error('Fehler beim Abrufen der Zeiteinträge:', error)
      return []
    }
  }

  private getDateKeyFromValue(value: unknown): string {
    const date = this.convertToDate(value)
    return formatDateForInputLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
  }

  private isWeekendDate(date: Date): boolean {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  private getCancelledLeaveDateKeys(leaveRequest: LeaveRequest): Set<string> {
    return new Set(
      (leaveRequest.cancelledDates || [])
        .map((value) => String(value || '').slice(0, 10))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )
  }

  private getActiveVacationDayKeys(leaveRequest: LeaveRequest): string[] {
    const start = this.convertToDate(leaveRequest.startDate)
    const end = this.convertToDate(leaveRequest.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return []

    const cancelled = this.getCancelledLeaveDateKeys(leaveRequest)
    const keys: string[] = []
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())

    while (current <= last) {
      const key = formatDateForInputLocal(current)
      if (!this.isWeekendDate(current) && !cancelled.has(key)) {
        keys.push(key)
      }
      current.setDate(current.getDate() + 1)
    }

    return keys
  }

  private leaveRequestCoversActiveVacationDate(leaveRequest: LeaveRequest, dateKey: string): boolean {
    if (leaveRequest.type !== 'vacation' || leaveRequest.status !== 'approved') return false
    return this.getActiveVacationDayKeys(leaveRequest).includes(dateKey)
  }

  private async getApprovedVacationRequestsForEmployeeOnDate(
    employeeId: string | undefined,
    dateKey: string
  ): Promise<LeaveRequest[]> {
    if (!employeeId || !dateKey) return []

    try {
      const leaveRequestsRef = collection(db, 'leaveRequests')
      const q = query(
        leaveRequestsRef,
        where('employeeId', '==', employeeId),
        where('status', '==', 'approved'),
        where('type', '==', 'vacation')
      )
      const snapshot = await getDocs(q)
      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as LeaveRequest))
        .filter((request) => this.leaveRequestCoversActiveVacationDate(request, dateKey))
    } catch (error) {
      console.error('Fehler beim Pruefen genehmigter Urlaubsantraege:', error)
      return []
    }
  }

  private buildVacationCancellationUpdate(
    leaveRequest: LeaveRequest,
    workedDateKey: string,
    timeEntryId: string
  ): { update: Record<string, unknown>; creditDays: number } | null {
    if (!this.leaveRequestCoversActiveVacationDate(leaveRequest, workedDateKey)) return null

    const activeKeys = this.getActiveVacationDayKeys(leaveRequest)
    const remainingActiveKeys = activeKeys.filter((key) => key !== workedDateKey)
    const dateLabel = new Date(`${workedDateKey}T12:00:00`).toLocaleDateString('de-DE')
    const reason = `Automatisch storniert: Mitarbeiter hat am ${dateLabel} gestempelt.`
    const existingWorkingDays = Number(leaveRequest.workingDays)

    const update: Record<string, unknown> = {
      cancelledDates: arrayUnion(workedDateKey),
      autoCancelledAt: new Date(),
      autoCancellationReason: reason,
      autoCancelledByTimeEntryId: timeEntryId,
      updatedAt: new Date()
    }

    if (remainingActiveKeys.length === 0) {
      update.status = 'rejected'
      update.rejectionReason = reason
      update.workingDays = 0
    } else {
      update.workingDays = Math.max(
        0,
        (Number.isFinite(existingWorkingDays) && existingWorkingDays > 0
          ? existingWorkingDays
          : activeKeys.length) - 1
      )
    }

    return { update, creditDays: 1 }
  }

  async addTimeEntry(timeEntryData: Partial<TimeEntry>): Promise<TimeEntry> {
    await this.authReadyPromise
    try {
      if (!timeEntryData.employeeId) {
        throw new Error('Keine gültige Mitarbeiter-ID angegeben')
      }

      // Validierung: Prüfe auf doppelte Einstempelung
      const existingEntry = await this.getCurrentTimeEntry(timeEntryData.employeeId!)
      if (existingEntry) {
        throw new Error('Sie sind bereits eingestempelt. Bitte stempeln Sie zuerst aus.')
      }

      const employeeRef = doc(db, 'employees', timeEntryData.employeeId)
      const timeEntriesRef = collection(db, 'timeEntries')
      const timeEntryRef = doc(timeEntriesRef)

      const normalizedClockInTime = timeEntryData.clockInTime
        ? (timeEntryData.clockInTime instanceof Date
            ? Timestamp.fromDate(timeEntryData.clockInTime)
            : timeEntryData.clockInTime)
        : Timestamp.now()
      const workedDateKey = this.getDateKeyFromValue(normalizedClockInTime)
      const vacationRequestsToCancel = await this.getApprovedVacationRequestsForEmployeeOnDate(
        timeEntryData.employeeId,
        workedDateKey
      )

      const entryData = {
        ...timeEntryData,
        entryId: timeEntryRef.id,
        clockInTime: normalizedClockInTime,
        clockOutTime: null,
        ...(vacationRequestsToCancel.length > 0
          ? { autoCancelledVacationRequestIds: vacationRequestsToCancel.map((request) => request.id).filter(Boolean) }
          : {})
      }

      await runTransaction(db, async (transaction) => {
        const employeeDoc = await transaction.get(employeeRef)
        if (!employeeDoc.exists()) {
          throw new Error('Mitarbeiter nicht gefunden')
        }

        const employeeData = employeeDoc.data() as any
        if (employeeData.activeTimeEntryId) {
          const activeEntryRef = doc(db, 'timeEntries', employeeData.activeTimeEntryId)
          const activeEntryDoc = await transaction.get(activeEntryRef)
          if (activeEntryDoc.exists()) {
            const activeEntryData = activeEntryDoc.data() as TimeEntry
            if (activeEntryData.clockOutTime == null) {
              throw new Error('Sie sind bereits eingestempelt. Bitte stempeln Sie zuerst aus.')
            }
          }
        }

        const vacationUpdates: Array<{ ref: ReturnType<typeof doc>; update: Record<string, unknown> }> = []
        let vacationDaysToCredit = 0
        for (const request of vacationRequestsToCancel) {
          if (!request.id) continue
          const requestRef = doc(db, 'leaveRequests', request.id)
          const requestDoc = await transaction.get(requestRef)
          if (!requestDoc.exists()) continue
          const freshRequest = { id: requestDoc.id, ...requestDoc.data() } as LeaveRequest
          const cancellation = this.buildVacationCancellationUpdate(
            freshRequest,
            workedDateKey,
            timeEntryRef.id
          )
          if (!cancellation) continue
          vacationDaysToCredit += cancellation.creditDays
          vacationUpdates.push({ ref: requestRef, update: cancellation.update })
        }

        transaction.set(timeEntryRef, entryData)
        vacationUpdates.forEach(({ ref, update }) => transaction.update(ref, update))

        const employeeUpdate: Record<string, unknown> = {
          activeTimeEntryId: timeEntryRef.id,
          activeClockInAt: normalizedClockInTime,
          updatedAt: new Date()
        }
        if (vacationDaysToCredit > 0) {
          const vd = employeeData.vacationDays || {
            total: 30,
            used: 0,
            year: new Date().getFullYear()
          }
          employeeUpdate.vacationDays = {
            ...vd,
            used: Math.max(0, (Number(vd.used) || 0) - vacationDaysToCredit),
            year: vd.year ?? new Date().getFullYear()
          }
        }

        transaction.update(employeeRef, employeeUpdate)
      })
      
      const newEntry = await getDoc(timeEntryRef)
      return { id: timeEntryRef.id, ...newEntry.data() } as TimeEntry
    } catch (error) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error)
      throw error
    }
  }

  /**
   * Abgeschlossenen Zeiteintrag nachtragen (Start + Ende).
   * Ändert nicht den Einstempel-Status des Mitarbeiters (kein activeTimeEntryId).
   */
  async addManualCompletedTimeEntry(params: {
    targetEmployeeId: string
    projectId: string
    clockInTime: Date
    clockOutTime: Date
    pauseTotalTimeMs?: number
    notes?: string
    addedByEmployeeId: string
    addedByDisplayName: string
  }): Promise<TimeEntry> {
    await this.authReadyPromise
    try {
      if (!params.targetEmployeeId || !params.projectId) {
        throw new Error('Mitarbeiter und Projekt sind erforderlich')
      }
      if (params.clockOutTime.getTime() <= params.clockInTime.getTime()) {
        throw new Error('Endzeit muss nach der Startzeit liegen')
      }
      const now = Date.now()
      if (params.clockInTime.getTime() > now) {
        throw new Error('Startzeit darf nicht in der Zukunft liegen')
      }
      if (params.clockOutTime.getTime() > now) {
        throw new Error('Endzeit darf nicht in der Zukunft liegen')
      }

      const timeEntriesRef = collection(db, 'timeEntries')
      const timeEntryRef = doc(timeEntriesRef)
      const clockInTs = Timestamp.fromDate(params.clockInTime)
      const clockOutTs = Timestamp.fromDate(params.clockOutTime)
      const pauseTotalTime = params.pauseTotalTimeMs ?? 0
      const workedDateKey = this.getDateKeyFromValue(clockInTs)
      const vacationRequestsToCancel = await this.getApprovedVacationRequestsForEmployeeOnDate(
        params.targetEmployeeId,
        workedDateKey
      )

      const noteBase = params.notes?.trim() ?? ''
      const auditNote = `Nachtrag durch ${params.addedByDisplayName}`
      const notes = noteBase ? `${noteBase} | ${auditNote}` : auditNote

      const rawPayload: Record<string, unknown> = {
        entryId: timeEntryRef.id,
        employeeId: params.targetEmployeeId,
        projectId: params.projectId,
        clockInTime: clockInTs,
        clockOutTime: clockOutTs,
        pauseTotalTime,
        notes,
        manualTimeEntry: true,
        manualTimeEntryAddedByEmployeeId: params.addedByEmployeeId,
        manualTimeEntryAddedByDisplayName: params.addedByDisplayName,
        manualTimeEntryCreatedAt: serverTimestamp(),
        ...(vacationRequestsToCancel.length > 0
          ? { autoCancelledVacationRequestIds: vacationRequestsToCancel.map((request) => request.id).filter(Boolean) }
          : {}),
        heroSyncStatus: 'pending',
        heroSyncError: null
      }

      const payload = Object.fromEntries(
        Object.entries(rawPayload).filter(([, value]) => value !== undefined)
      )

      await runTransaction(db, async (transaction) => {
        const empRef = doc(db, 'employees', params.targetEmployeeId)
        const empSnap = await transaction.get(empRef)
        const employeeData = empSnap.exists() ? (empSnap.data() as Employee) : null

        const vacationUpdates: Array<{ ref: ReturnType<typeof doc>; update: Record<string, unknown> }> = []
        let vacationDaysToCredit = 0
        for (const request of vacationRequestsToCancel) {
          if (!request.id) continue
          const requestRef = doc(db, 'leaveRequests', request.id)
          const requestDoc = await transaction.get(requestRef)
          if (!requestDoc.exists()) continue
          const freshRequest = { id: requestDoc.id, ...requestDoc.data() } as LeaveRequest
          const cancellation = this.buildVacationCancellationUpdate(
            freshRequest,
            workedDateKey,
            timeEntryRef.id
          )
          if (!cancellation) continue
          vacationDaysToCredit += cancellation.creditDays
          vacationUpdates.push({ ref: requestRef, update: cancellation.update })
        }

        transaction.set(timeEntryRef, payload)
        vacationUpdates.forEach(({ ref, update }) => transaction.update(ref, update))

        if (employeeData && vacationDaysToCredit > 0) {
          const vd = employeeData.vacationDays || {
            total: 30,
            used: 0,
            year: new Date().getFullYear()
          }
          transaction.update(empRef, {
            vacationDays: {
              ...vd,
              used: Math.max(0, (Number(vd.used) || 0) - vacationDaysToCredit),
              year: vd.year ?? new Date().getFullYear()
            },
            updatedAt: new Date()
          })
        }
      })
      const snap = await getDoc(timeEntryRef)
      // Nachgetragener (abgeschlossener) Eintrag → Überstunden des Tags neu berechnen
      await this.recomputeOvertimeForDay(params.targetEmployeeId, workedDateKey)
      return { id: timeEntryRef.id, ...snap.data() } as TimeEntry
    } catch (error) {
      console.error('Fehler beim Nachtragen des Zeiteintrags:', error)
      throw error
    }
  }

  async clockOutEmployee(
    timeEntryId: string,
    notes: string,
    location: { lat: number | null; lng: number | null } | null,
    pauseTotalTimeMs: number,
    materialUsages?: TimeEntryMaterialUsage[],
    materialCreditUsages?: TimeEntryMaterialUsage[]
  ): Promise<void> {
    await this.authReadyPromise
    try {
      if (!timeEntryId) {
        throw new Error('Keine gültige Zeiteintrag-ID angegeben')
      }
      if (
        typeof pauseTotalTimeMs !== 'number' ||
        !Number.isFinite(pauseTotalTimeMs) ||
        pauseTotalTimeMs < 0 ||
        pauseTotalTimeMs > 24 * 60 * 60 * 1000
      ) {
        throw new Error('Ungültige Pausenzeit')
      }

      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      const overtimeRecompute = await runTransaction<{ employeeId: string; dateKey: string } | null>(
        db,
        async (transaction) => {
        let recompute: { employeeId: string; dateKey: string } | null = null
        const timeEntryDoc = await transaction.get(timeEntryRef)
        if (!timeEntryDoc.exists()) {
          throw new Error('Zeiteintrag nicht gefunden')
        }

        const timeEntry = timeEntryDoc.data() as TimeEntry
        if (timeEntry.clockOutTime != null) {
          throw new Error('Dieser Mitarbeiter ist bereits ausgestempelt')
        }

        let employeeRef: any = null
        let employeeData: any = null
        let shouldClearActiveEntry = false
        if (timeEntry.employeeId) {
          employeeRef = doc(db, 'employees', timeEntry.employeeId)
          const employeeDoc = await transaction.get(employeeRef)
          if (employeeDoc.exists()) {
            employeeData = employeeDoc.data() as any
            shouldClearActiveEntry = employeeData.activeTimeEntryId === timeEntryId
          }
        }

        const clockOutTime = Timestamp.now()

        const updateData: any = {
          clockOutTime,
          notes: notes || timeEntry.notes || '',
          pauseTotalTime: Math.round(pauseTotalTimeMs)
        }

        if (location) {
          updateData.clockOutLocation = location
          updateData.locationOut = location

          // Fahrtzeit-Gutschrift nach Entfernungs-Staffel (Firmenstandort →
          // Standort des Mitarbeiters beim Ausstempeln) als Arbeitszeit gutschreiben.
          const travel = estimateReturnTravel(location)
          if (travel) {
            updateData.returnTravelDistanceKm = Math.round(travel.distanceKm * 10) / 10
            updateData.returnTravelMinutes = travel.creditMinutes
            updateData.returnTravelCreditMs = travel.creditMs
          }
        }

        if (materialUsages !== undefined) {
          updateData.materialUsages = materialUsages
        }

        if (materialCreditUsages !== undefined) {
          updateData.materialCreditUsages = materialCreditUsages
        }

        updateData.heroSyncStatus = 'pending'

        transaction.update(timeEntryRef, updateData)

        // Für die Überstunden-Tagesberechnung nach der Transaktion merken
        if (timeEntry.employeeId) {
          recompute = {
            employeeId: timeEntry.employeeId,
            dateKey: this.getDateKeyFromValue(timeEntry.clockInTime)
          }
        }

        if (employeeRef && employeeData && shouldClearActiveEntry) {
          transaction.update(employeeRef, {
            activeTimeEntryId: null,
            activeClockInAt: null,
            updatedAt: new Date()
          })
        }

        return recompute
      })

      // Rückfahrt-Gutschrift nur EINMAL pro Tag (letztes Ausstempeln). Da dieses
      // Ausstempeln das aktuell jüngste des Tages ist, die Gutschrift von früheren
      // Einträgen desselben Tages entfernen, sobald hier eine neue angerechnet wurde.
      const creditApplied = (estimateReturnTravel(location)?.creditMs ?? 0) > 0
      if (overtimeRecompute && creditApplied) {
        await this.clearOtherReturnTravelCredits(
          overtimeRecompute.employeeId,
          overtimeRecompute.dateKey,
          timeEntryId
        )
      }

      // Überstunden auf Basis der Tages-Summe neu berechnen (außerhalb der Transaktion)
      if (overtimeRecompute) {
        await this.recomputeOvertimeForDay(overtimeRecompute.employeeId, overtimeRecompute.dateKey)
      }
    } catch (error) {
      console.error('Fehler beim Ausstempeln:', error)
      throw error
    }
  }

  /**
   * Reguläre Tagesarbeitszeit (ohne Pause) in Minuten – Mo–Do 8 Std, Fr 6 Std,
   * Wochenende 0. Überstunden entstehen erst darüber.
   */
  private static regularMinutesForDay(dateKey: string): number {
    return regularMinutesForDateKey(dateKey)
  }

  /** Gebuchte Arbeitsminuten eines Eintrags (Kommen − Gehen − Pause + Rückfahrt-Gutschrift). */
  private overtimeWorkedMinutesForEntry(entry: TimeEntry): number {
    if (entry.isVacationDay) return 0
    if (!entry.clockInTime || !entry.clockOutTime) return 0
    // Zeiten auf 15-Min-Raster glätten (einheitliche Basis für Überstunden)
    const inMs = roundTimeToStep(this.convertToDate(entry.clockInTime)).getTime()
    const outMs = roundTimeToStep(this.convertToDate(entry.clockOutTime)).getTime()
    const pauseMs = Number(entry.pauseTotalTime) || 0
    const creditMs = getReturnTravelCreditMs(entry)
    const ms = outMs - inMs - pauseMs + creditMs
    return ms > 0 ? ms / 60000 : 0
  }

  /** Überstunden eines Kalendertags = max(0, Tages-Summe − 8,5 Std). */
  private async overtimeMinutesForDay(employeeId: string, dateKey: string): Promise<number> {
    const entries = await this.getTimeEntriesByEmployeeId(employeeId)
    let dayMinutes = 0
    for (const entry of entries) {
      if (!entry.clockOutTime) continue
      if (this.getDateKeyFromValue(entry.clockInTime) !== dateKey) continue
      dayMinutes += this.overtimeWorkedMinutesForEntry(entry)
    }
    return Math.max(0, Math.round(dayMinutes - DataServiceClass.regularMinutesForDay(dateKey)))
  }

  /**
   * Entfernt die Rückfahrt-Gutschrift von allen Einträgen eines Mitarbeiters am
   * selben Tag außer dem angegebenen. So trägt nur das letzte Ausstempeln des
   * Tages die Heimfahrt-Gutschrift (statt jeder Projektwechsel/jedes Ausstempeln).
   */
  private async clearOtherReturnTravelCredits(
    employeeId: string,
    dateKey: string,
    keepEntryId: string
  ): Promise<void> {
    try {
      const entries = await this.getTimeEntriesByEmployeeId(employeeId)
      const stale = entries.filter(
        (e) =>
          e.id !== keepEntryId &&
          this.getDateKeyFromValue(e.clockInTime) === dateKey &&
          getReturnTravelCreditMs(e) > 0
      )
      for (const e of stale) {
        await updateDoc(doc(db, 'timeEntries', e.id), { returnTravelCreditMs: 0 })
      }
    } catch (error) {
      console.warn('Konnte frühere Rückfahrt-Gutschriften nicht bereinigen:', error)
    }
  }

  /**
   * Bereinigt Bestandsdaten: pro Tag (Einstempel-Datum) behält nur das letzte
   * Ausstempeln die Rückfahrt-Gutschrift, alle früheren werden auf 0 gesetzt.
   * Mutiert die übergebenen Einträge zugleich, damit Folgeberechnungen stimmen.
   */
  private async normalizeReturnTravelCreditsForEntries(entries: TimeEntry[]): Promise<void> {
    const byDay = new Map<string, TimeEntry[]>()
    for (const e of entries) {
      if (!e.clockOutTime) continue
      const key = this.getDateKeyFromValue(e.clockInTime)
      const list = byDay.get(key) || []
      list.push(e)
      byDay.set(key, list)
    }

    for (const list of byDay.values()) {
      const credited = list.filter((e) => getReturnTravelCreditMs(e) > 0)
      if (credited.length <= 1) continue

      // Jüngstes Ausstempeln des Tages behalten
      let keep = credited[0]
      for (const e of credited) {
        if (this.convertToDate(e.clockOutTime).getTime() > this.convertToDate(keep.clockOutTime).getTime()) {
          keep = e
        }
      }

      for (const e of credited) {
        if (e.id === keep.id) continue
        e.returnTravelCreditMs = 0
        try {
          await updateDoc(doc(db, 'timeEntries', e.id), { returnTravelCreditMs: 0 })
        } catch (error) {
          console.warn('Konnte Rückfahrt-Gutschrift nicht bereinigen:', e.id, error)
        }
      }
    }
  }

  /**
   * Berechnet die Überstunden eines Kalendertags neu und passt den Saldo des
   * Mitarbeiters um die Differenz zum bisher gespeicherten Tageswert an.
   * Deckt Ausstempeln, Korrekturen und Nachträge ab (Tages-Summe).
   */
  async recomputeOvertimeForDay(employeeId: string, dateKey: string): Promise<void> {
    if (!employeeId || !dateKey) return
    try {
      const dayOvertime = await this.overtimeMinutesForDay(employeeId, dateKey)
      const employeeRef = doc(db, 'employees', employeeId)
      const dayRef = doc(db, 'employees', employeeId, 'overtimeDays', dateKey)
      await runTransaction(db, async (transaction) => {
        const employeeDoc = await transaction.get(employeeRef)
        if (!employeeDoc.exists()) return
        const dayDoc = await transaction.get(dayRef)
        const prev = dayDoc.exists() ? Number((dayDoc.data() as any).minutes) || 0 : 0
        const delta = dayOvertime - prev
        if (delta !== 0) {
          const current = Number((employeeDoc.data() as any).overtimeBalanceMinutes) || 0
          transaction.update(employeeRef, {
            overtimeBalanceMinutes: Math.max(0, current + delta),
            updatedAt: new Date()
          })
        }
        transaction.set(dayRef, { minutes: dayOvertime, updatedAt: new Date() })
      })
    } catch (error) {
      console.warn('Überstunden-Tagesberechnung fehlgeschlagen:', error)
    }
  }

  /**
   * Vollständige Neuberechnung des Überstundenkontos eines Mitarbeiters:
   * verdiente Überstunden (Tages-Summen über 8,5 Std) minus genehmigte
   * „Urlaub auf Überstunden"-Tage. Setzt den Saldo neu und schreibt die
   * Tageswerte. Dient als Korrektur-/Migrations-Button.
   */
  async recomputeOvertimeBalance(employeeId: string): Promise<number> {
    await this.authReadyPromise
    if (!employeeId) return 0
    const entries = await this.getTimeEntriesByEmployeeId(employeeId)
    // Bestandsdaten korrigieren: Rückfahrt-Gutschrift nur beim letzten Ausstempeln/Tag
    await this.normalizeReturnTravelCreditsForEntries(entries)
    const minutesByDay = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.clockOutTime) continue
      const dateKey = this.getDateKeyFromValue(entry.clockInTime)
      minutesByDay.set(dateKey, (minutesByDay.get(dateKey) || 0) + this.overtimeWorkedMinutesForEntry(entry))
    }

    // Monate, für die der Mitarbeiter selbst gemeldet hat, wie viel abgerechnet
    // werden soll, folgen NICHT der Tagesregel: dort gilt der nicht
    // abgerechnete Rest. Sonst zählte derselbe Monat zweimal – einmal über die
    // Tages-Überstunden, einmal über die Meldung.
    const settlements = await overtimeSettlements.getOvertimeSettlements(employeeId)
    const settledMonths = new Map<string, number>()
    for (const s of settlements) {
      if (typeof s.workedMinutes !== 'number') continue
      settledMonths.set(s.month, Math.max(0, s.workedMinutes - (Number(s.minutes) || 0)))
    }

    let earned = 0
    const dayOvertimes: Array<{ dateKey: string; minutes: number }> = []
    for (const [dateKey, mins] of minutesByDay) {
      const ot = Math.max(0, Math.round(mins - DataServiceClass.regularMinutesForDay(dateKey)))
      dayOvertimes.push({ dateKey, minutes: ot })
      if (!settledMonths.has(dateKey.slice(0, 7))) earned += ot
    }
    for (const rest of settledMonths.values()) earned += rest

    // Bereits als „Urlaub auf Überstunden" genehmigte Stunden abziehen
    const leaveRequests = await this.getLeaveRequestsByEmployee(employeeId)
    let spent = 0
    for (const req of leaveRequests) {
      if (req.type === 'overtime' && req.status === 'approved') {
        const reqStart = this.convertToDate(req.startDate)
        const reqEnd = this.convertToDate(req.endDate)
        spent += reqStart && reqEnd ? regularMinutesForRange(reqStart, reqEnd) : 0
      }
    }

    const balance = Math.max(0, earned - spent)

    // Tageswerte schreiben (für spätere delta-basierte Aktualisierung)
    for (const day of dayOvertimes) {
      try {
        await setDoc(
          doc(db, 'employees', employeeId, 'overtimeDays', day.dateKey),
          { minutes: day.minutes, updatedAt: new Date() },
          { merge: true }
        )
      } catch (e) {
        console.warn('Überstunden-Tageswert konnte nicht gespeichert werden:', day.dateKey, e)
      }
    }

    await updateDoc(doc(db, 'employees', employeeId), {
      overtimeBalanceMinutes: balance,
      updatedAt: new Date()
    })
    return balance
  }

  async updateTimeEntry(timeEntryId: string, updateData: Partial<TimeEntry>): Promise<void> {
    await this.authReadyPromise
    try {
      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      await updateDoc(timeEntryRef, updateData)

      // Bei Zeit-/Pausen-Änderungen (z. B. Admin-Korrektur, vergessenes
      // Ausstempeln) die Überstunden des betroffenen Tags neu berechnen.
      const touchesWorkTime =
        'clockInTime' in updateData ||
        'clockOutTime' in updateData ||
        'pauseTotalTime' in updateData
      if (touchesWorkTime) {
        try {
          const snap = await getDoc(timeEntryRef)
          if (snap.exists()) {
            const entry = snap.data() as TimeEntry
            if (entry.employeeId && entry.clockInTime) {
              await this.recomputeOvertimeForDay(
                entry.employeeId,
                this.getDateKeyFromValue(entry.clockInTime)
              )
            }
          }
        } catch (recomputeError) {
          console.warn('Überstunden nach Korrektur nicht neu berechnet:', recomputeError)
        }
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Zeiteintrags:', error)
      throw error
    }
  }

  /**
   * Admin-Korrektur eines Stempelsatzes direkt aus dem Zeiterfassungsbericht.
   *
   * Schreibt die geänderten Felder unmittelbar in die Datenbank:
   *  - Projektwechsel wird über {@link moveTimeEntryToProject} abgewickelt, damit
   *    Fotos, Dokumente und Fahrzeugbuchungen mit umziehen. Für noch laufende
   *    (nicht ausgestempelte) Sätze ist ein Umzug technisch nicht möglich – dort
   *    wird nur die projectId umgesetzt.
   *  - Kommen/Gehen/Pause werden als echte Werte gespeichert (kein reiner
   *    Druck-Override) und die Überstunden des Tages neu berechnet.
   *
   * Nur die tatsächlich übergebenen Felder werden angefasst; nicht übergebene
   * Felder (z. B. Rohzeiten ohne Sekunden-Rundung) bleiben unverändert.
   */
  async applyAdminTimeEntryCorrection(params: {
    timeEntryId: string
    projectId?: string
    clockInTime?: Date
    clockOutTime?: Date | null
    pauseTotalTimeMs?: number
    notes?: string
    correctedBy?: { id?: string; name?: string }
  }): Promise<TimeEntry | null> {
    await this.authReadyPromise
    if (!params.timeEntryId?.trim()) {
      throw new Error('Kein Stempelsatz angegeben')
    }

    const entry = await this.getTimeEntryById(params.timeEntryId)
    if (!entry) {
      throw new Error('Stempelsatz nicht gefunden')
    }

    // Zielzeiten bestimmen (übergebene Werte haben Vorrang vor dem Bestand).
    const nextClockIn =
      params.clockInTime instanceof Date ? params.clockInTime : this.convertToDate(entry.clockInTime)
    const nextClockOut =
      params.clockOutTime === undefined
        ? entry.clockOutTime
          ? this.convertToDate(entry.clockOutTime)
          : null
        : params.clockOutTime

    if (nextClockIn && nextClockOut && nextClockOut.getTime() <= nextClockIn.getTime()) {
      throw new Error('Die Gehen-Zeit muss nach der Kommen-Zeit liegen')
    }
    if (params.pauseTotalTimeMs !== undefined && params.pauseTotalTimeMs < 0) {
      throw new Error('Die Pause darf nicht negativ sein')
    }

    // 1) Projektwechsel (Umzug inkl. Dateien/Fahrzeuge)
    const targetProjectId = params.projectId?.trim()
    if (targetProjectId && targetProjectId !== entry.projectId) {
      const canMoveWithAttachments = entry.clockOutTime != null && !!entry.projectId
      if (canMoveWithAttachments) {
        const [sourceProject, targetProject] = await Promise.all([
          this.getProjectById(entry.projectId),
          this.getProjectById(targetProjectId)
        ])
        await this.moveTimeEntryToProject(params.timeEntryId, targetProjectId, {
          sourceProjectName: sourceProject?.name,
          targetProjectName: targetProject?.name
        })
      } else {
        // Laufender Satz oder Kleinauftrag ohne Projekt: nur die Zuordnung setzen.
        await this.updateTimeEntry(params.timeEntryId, { projectId: targetProjectId })
      }
    }

    // 2) Zeiten/Pause/Notiz + Audit-Trail
    const update: Record<string, unknown> = {}
    if (params.clockInTime instanceof Date) {
      update.clockInTime = Timestamp.fromDate(params.clockInTime)
    }
    if (params.clockOutTime !== undefined) {
      update.clockOutTime =
        params.clockOutTime === null ? null : Timestamp.fromDate(params.clockOutTime)
    }
    if (params.pauseTotalTimeMs !== undefined) {
      update.pauseTotalTime = params.pauseTotalTimeMs
    }
    if (params.notes !== undefined) {
      update.notes = params.notes
    }

    if (Object.keys(update).length > 0 || targetProjectId) {
      update.adminCorrectedAt = new Date()
      if (params.correctedBy?.id) update.adminCorrectedBy = params.correctedBy.id
      if (params.correctedBy?.name) update.adminCorrectedByName = params.correctedBy.name
      await this.updateTimeEntry(params.timeEntryId, update as Partial<TimeEntry>)
    }

    // 3) Wurde ein laufender Satz per Korrektur beendet, darf der Mitarbeiter
    // nicht weiter als "eingestempelt" gelten.
    const wasRunning = entry.clockOutTime == null
    const nowClosed = update.clockOutTime != null && update.clockOutTime !== undefined
    if (wasRunning && nowClosed && entry.employeeId) {
      try {
        const employeeRef = doc(db, 'employees', entry.employeeId)
        const employeeSnap = await getDoc(employeeRef)
        if (
          employeeSnap.exists() &&
          (employeeSnap.data() as { activeTimeEntryId?: string }).activeTimeEntryId ===
            params.timeEntryId
        ) {
          await updateDoc(employeeRef, {
            activeTimeEntryId: null,
            activeClockInAt: null,
            updatedAt: new Date()
          })
        }
      } catch (error) {
        console.warn('Aktiver Stempelsatz konnte nach der Korrektur nicht gelöst werden:', error)
      }
    }

    return this.getTimeEntryById(params.timeEntryId)
  }

  /**
   * Wechselt das Projekt eines eingestempelten Mitarbeiters, ohne dass dieser sich ausstempeln
   * muss: Der aktuelle Stempelsatz wird ohne Pause beendet und sofort ein neuer Stempelsatz auf
   * dem neuen Projekt gestartet. Pausen werden erst beim regulären Ausstempeln am Tagesende erfasst.
   */
  async switchActiveProject(
    employeeId: string,
    currentTimeEntryId: string,
    newProjectId: string,
    location: { lat: number | null; lng: number | null } | null,
    materialUsages?: TimeEntryMaterialUsage[]
  ): Promise<TimeEntry> {
    await this.authReadyPromise
    try {
      if (!employeeId || !currentTimeEntryId || !newProjectId) {
        throw new Error('Mitarbeiter, Zeiteintrag und neues Projekt sind erforderlich')
      }

      const currentRef = doc(db, 'timeEntries', currentTimeEntryId)
      const employeeRef = doc(db, 'employees', employeeId)
      const newEntryRef = doc(collection(db, 'timeEntries'))

      await runTransaction(db, async (transaction) => {
        const [currentSnap, employeeSnap] = await Promise.all([
          transaction.get(currentRef),
          transaction.get(employeeRef)
        ])

        if (!currentSnap.exists()) {
          throw new Error('Aktueller Zeiteintrag nicht gefunden')
        }
        if (!employeeSnap.exists()) {
          throw new Error('Mitarbeiter nicht gefunden')
        }

        const current = currentSnap.data() as TimeEntry
        if (current.clockOutTime != null) {
          throw new Error('Sie sind nicht mehr eingestempelt')
        }
        if (current.projectId === newProjectId) {
          throw new Error('Bitte wählen Sie ein anderes Projekt')
        }

        const employeeData = employeeSnap.data() as { activeTimeEntryId?: string }
        if (employeeData.activeTimeEntryId && employeeData.activeTimeEntryId !== currentTimeEntryId) {
          throw new Error('Aktiver Stempelsatz stimmt nicht überein. Bitte Seite neu laden.')
        }

        const clockOutTime = Timestamp.now()
        const clockInTime = clockOutTime
        const existingNotes = (current.notes || '').trim()
        const switchNote = 'Projektwechsel'
        const notes = existingNotes ? `${existingNotes} | ${switchNote}` : switchNote

        const clockOutUpdate: Record<string, unknown> = {
          clockOutTime,
          pauseTotalTime: 0,
          notes,
          projectSwitchOut: true
        }
        if (location) {
          clockOutUpdate.clockOutLocation = location
          clockOutUpdate.locationOut = location
        }
        // Auf dem alten Projekt erfasstes Material vor dem Wechsel verbuchen,
        // damit es dem korrekten (verlassenen) Projekt zugeordnet bleibt.
        if (materialUsages && materialUsages.length > 0) {
          clockOutUpdate.materialUsages = materialUsages
          clockOutUpdate.heroSyncStatus = 'pending'
        }
        transaction.update(currentRef, clockOutUpdate)

        const newEntryData: Record<string, unknown> = {
          entryId: newEntryRef.id,
          employeeId,
          projectId: newProjectId,
          clockInTime,
          clockOutTime: null,
          clockInLocation: location,
          notes: '',
          pauseTotalTime: 0,
          projectSwitchIn: true
        }
        transaction.set(newEntryRef, newEntryData)

        transaction.update(employeeRef, {
          activeTimeEntryId: newEntryRef.id,
          activeClockInAt: clockInTime,
          updatedAt: new Date()
        })
      })

      const newSnap = await getDoc(newEntryRef)
      return { id: newEntryRef.id, ...newSnap.data() } as TimeEntry
    } catch (error) {
      console.error('Fehler beim Projektwechsel:', error)
      throw error
    }
  }

  /**
   * Verknüpft bereits hochgeladene Fotos/Dokumente mit einem Zeiteintrag und MERGT sie in die
   * bestehenden Listen ein (liest den Eintrag frisch). Idempotent gegenüber bereits vorhandenen
   * Feldern — wird sowohl online als auch vom Offline-Upload-Queue (späteres Nachreichen) genutzt.
   */
  async attachDocumentationUploads(
    timeEntryId: string,
    data: { sitePhotos?: FileUpload[]; documents?: FileUpload[]; notes?: string }
  ): Promise<void> {
    await this.authReadyPromise
    const entry = await this.getTimeEntryById(timeEntryId)
    if (!entry) throw new Error('Zeiteintrag nicht gefunden')

    const sitePhotos = data.sitePhotos || []
    const documents = data.documents || []

    const mergeIds = (existing: unknown, additions: FileUpload[]): string[] => {
      const prev = Array.isArray(existing) ? (existing as unknown[]).map(String).filter(Boolean) : []
      return [...prev, ...additions.map((u) => u.id)]
    }
    const mergeRefs = (existing: unknown, additions: FileUpload[]): unknown[] => {
      const base = Array.isArray(existing) ? [...existing] : []
      return [...base, ...additions.map(toFileUploadRef)]
    }

    const mergedSiteUploads = mergeIds(entry.sitePhotoUploads, sitePhotos)
    const mergedDocUploads = mergeIds(entry.documentPhotoUploads, documents)
    const notes = typeof data.notes === 'string' ? data.notes.trim() : undefined

    const update: Partial<TimeEntry> = {
      sitePhotoUploads: mergedSiteUploads,
      documentPhotoUploads: mergedDocUploads,
      sitePhotos: mergeRefs(entry.sitePhotos, sitePhotos) as TimeEntry['sitePhotos'],
      documents: mergeRefs(entry.documents, documents) as TimeEntry['documents'],
      hasDocumentation:
        !!entry.hasDocumentation ||
        mergedSiteUploads.length > 0 ||
        mergedDocUploads.length > 0 ||
        (entry.notes || '').trim() !== '' ||
        !!notes
    }
    // Notizen nur setzen, wenn übergeben und noch nicht identisch gespeichert (kein Überschreiben mit leer)
    if (notes && notes !== (entry.notes || '').trim()) {
      update.notes = notes
    }

    await this.updateTimeEntry(timeEntryId, update)
  }

  /**
   * Zeiteintrag inkl. verknüpfter Dokumente (fileUploads) und Fahrzeugbuchungen am Arbeitstag
   * auf ein anderes Projekt umhängen (Admin-Korrektur falscher Projektwahl).
   */
  async moveTimeEntryToProject(
    timeEntryId: string,
    targetProjectId: string,
    options?: { sourceProjectName?: string; targetProjectName?: string }
  ): Promise<void> {
    await this.authReadyPromise
    if (!timeEntryId?.trim() || !targetProjectId?.trim()) {
      throw new Error('Zeiteintrag und Zielprojekt sind erforderlich')
    }

    const entry = await this.getTimeEntryById(timeEntryId)
    if (!entry) {
      throw new Error('Zeiteintrag nicht gefunden')
    }

    // Normalisiert, damit fehlende und leere projectId (Kleinauftrag) gleich behandelt werden
    const sourceProjectId = entry.projectId || ''
    if (sourceProjectId === targetProjectId) {
      throw new Error('Der Eintrag liegt bereits in diesem Projekt')
    }

    if (entry.clockOutTime == null || entry.clockOutTime === undefined) {
      throw new Error(
        'Einstempel-Einträge können nicht umgezogen werden. Bitte zuerst ausstempeln oder den aktiven Eintrag beenden.'
      )
    }

    const targetProject = await this.getProjectById(targetProjectId)
    if (!targetProject) {
      throw new Error('Zielprojekt nicht gefunden')
    }

    const clockIn = this.convertToDate(entry.clockInTime)
    const clockOut = this.convertToDate(entry.clockOutTime)
    const workDayKey = formatDateForInputLocal(clockIn)

    const fileIdSet = new Set<string>()
    ;(entry.sitePhotoUploads || []).forEach((id) => collectFileReferenceIds(id, fileIdSet))
    ;(entry.documentPhotoUploads || []).forEach((id) => collectFileReferenceIds(id, fileIdSet))
    collectFileReferenceIds(entry.photos, fileIdSet)
    collectFileReferenceIds(entry.sitePhotos, fileIdSet)
    collectFileReferenceIds(entry.documents, fileIdSet)
    collectFileReferenceIds(entry.liveDocumentation, fileIdSet)
    fileIdSet.delete(timeEntryId)
    if (entry.employeeId) fileIdSet.delete(String(entry.employeeId))

    const uploadInWorkWindow = (uploadTime: unknown): boolean => {
      const d = this.convertToDate(uploadTime)
      const t = d.getTime()
      return t >= clockIn.getTime() && t <= clockOut.getTime()
    }

    const mergeFileUploadsForEntry = async (): Promise<void> => {
      // WICHTIG: Nur mit echtem Quellprojekt. getFileUploads('') liefert ALLE
      // Uploads – die Tages-Heuristik unten würde dann Fotos des Mitarbeiters
      // aus fremden Projekten mitreißen. Bei Kleinaufträgen (leere projectId)
      // zählen deshalb ausschließlich die am Stempelsatz verlinkten Dateien.
      if (!sourceProjectId) return
      const uploads = await this.getFileUploads(sourceProjectId)
      for (const u of uploads) {
        if (!u.id || u.employeeId !== entry.employeeId) continue
        const dayOfUpload = formatDateForInputLocal(this.convertToDate(u.uploadTime))
        if (uploadInWorkWindow(u.uploadTime) || dayOfUpload === workDayKey) {
          fileIdSet.add(u.id)
        }
      }
    }
    await mergeFileUploadsForEntry()

    const byTimeEntryLink = await this.getFileUploadsByTimeEntryIds([timeEntryId])
    for (const u of byTimeEntryLink) {
      if (u.id) fileIdSet.add(u.id)
    }

    const patchNestedProject = (items: any[] | undefined): any[] | undefined => {
      if (!items || !Array.isArray(items)) return items
      return items.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return { ...item, projectId: targetProjectId }
        }
        return item
      })
    }

    const patchLiveDocumentationProject = (live: unknown, targetId: string): unknown[] | undefined => {
      if (!live || !Array.isArray(live)) return undefined
      return live.map((block: any) => {
        if (!block || typeof block !== 'object') return block
        const next = { ...block }
        if (Array.isArray(next.images)) {
          next.images = next.images.map((img: any) =>
            img && typeof img === 'object' ? { ...img, projectId: targetId } : img
          )
        }
        if (Array.isArray(next.documents)) {
          next.documents = next.documents.map((d: any) =>
            d && typeof d === 'object' ? { ...d, projectId: targetId } : d
          )
        }
        return next
      })
    }

    const auditLine = `Projekt geändert: ${options?.sourceProjectName || sourceProjectId} → ${options?.targetProjectName || targetProject.name || targetProjectId}`
    const newNotes = (entry.notes || '').trim()
      ? `${(entry.notes || '').trim()} | ${auditLine}`
      : auditLine

    const timeEntryUpdate: Record<string, unknown> = {
      projectId: targetProjectId,
      notes: newNotes,
      sitePhotos: patchNestedProject(entry.sitePhotos as any[]),
      documents: patchNestedProject(entry.documents as any[])
    }

    if (
      entry.photos &&
      Array.isArray(entry.photos) &&
      entry.photos.length > 0 &&
      typeof (entry.photos as any[])[0] === 'object'
    ) {
      timeEntryUpdate.photos = patchNestedProject(entry.photos as any[])
    }

    const patchedLive = patchLiveDocumentationProject(entry.liveDocumentation, targetProjectId)
    if (patchedLive) {
      timeEntryUpdate.liveDocumentation = patchedLive
    }

    const cleanedUpdate = Object.fromEntries(
      Object.entries(timeEntryUpdate).filter(([, v]) => v !== undefined)
    ) as Partial<TimeEntry>

    const fileIdsRaw = [...fileIdSet].filter((id) => id && !isPlaceholderFileUploadId(id))
    const fileIds = await this.filterExistingFileUploadDocIds(fileIdsRaw)
    const maxBatch = 400
    for (let i = 0; i < fileIds.length; i += maxBatch) {
      const batch = writeBatch(db)
      const chunk = fileIds.slice(i, i + maxBatch)
      for (const fid of chunk) {
        batch.update(doc(db, 'fileUploads', fid), {
          projectId: targetProjectId,
          timeEntryId: timeEntryId
        })
      }
      await batch.commit()
    }

    await this.updateTimeEntry(timeEntryId, cleanedUpdate)

    const usageDayKey = (rawDate: any): string => {
      if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        return rawDate.slice(0, 10)
      }
      const d = this.convertToDate(rawDate)
      return formatDateForInputLocal(d)
    }

    const usageIdsToMoveSet = new Set<string>()

    const linkedUsages = await this.getVehicleUsagesByTimeEntryId(timeEntryId)
    for (const usage of linkedUsages) {
      if (usage.id && (usage.projectId || '') === sourceProjectId) {
        usageIdsToMoveSet.add(usage.id)
      }
    }

    const employeeUsages = await this.getVehicleUsagesByEmployeeId(entry.employeeId)
    for (const usage of employeeUsages) {
      if (!usage.id || (usage.projectId || '') !== sourceProjectId) continue
      if (usage.timeEntryId && usage.timeEntryId !== timeEntryId) continue
      if (usageDayKey(usage.date) === workDayKey) {
        usageIdsToMoveSet.add(usage.id)
      }
    }

    const usageIdsToMove = [...usageIdsToMoveSet]
    for (let i = 0; i < usageIdsToMove.length; i += maxBatch) {
      const batch = writeBatch(db)
      for (const uid of usageIdsToMove.slice(i, i + maxBatch)) {
        batch.update(doc(db, 'vehicleUsages', uid), { projectId: targetProjectId })
      }
      await batch.commit()
    }
  }

  /**
   * Alle Buchungen einer Quelle auf ein Zielprojekt umhängen (Admin-Sammelkorrektur).
   *
   * Quelle ist entweder ein Kunde (Kleinaufträge ohne Projekt – der häufigste
   * Fall: es wurde auf den Kunden statt auf das Projekt eingestempelt) oder ein
   * anderes Projekt (z. B. eine Dublette). Mitgenommen werden pro Stempelsatz
   * über {@link moveTimeEntryToProject} auch Fotos, Dokumente und
   * Fahrzeugbuchungen; das am Satz erfasste Material hängt ohnehin am Satz.
   * Bei Projekt-Quellen werden zusätzlich die Material-Buchungen
   * (materialCredits) des Quellprojekts umgehängt.
   *
   * Läuft bewusst sequenziell und liefert einen Bericht über jeden Satz zurück,
   * damit ein Teilfehler nicht den ganzen Vorgang unbrauchbar macht.
   */
  async moveBookingsToProject(params: {
    source: { type: 'customer'; id: string } | { type: 'project'; id: string }
    targetProjectId: string
    correctedBy?: { id?: string; name?: string }
    onProgress?: (done: number, total: number) => void
  }): Promise<{
    total: number
    movedEntries: number
    movedRunningEntries: number
    movedMaterialCredits: number
    failed: Array<{ timeEntryId: string; error: string }>
  }> {
    await this.authReadyPromise

    const targetProjectId = params.targetProjectId?.trim()
    if (!targetProjectId) {
      throw new Error('Bitte ein Zielprojekt wählen')
    }
    if (!params.source?.id) {
      throw new Error('Keine Quelle angegeben')
    }
    if (params.source.type === 'project' && params.source.id === targetProjectId) {
      throw new Error('Quell- und Zielprojekt sind identisch')
    }

    const targetProject = await this.getProjectById(targetProjectId)
    if (!targetProject) {
      throw new Error('Zielprojekt nicht gefunden')
    }
    const targetProjectName = targetProject.name || targetProjectId

    // Betroffene Stempelsätze einsammeln
    let entries: TimeEntry[]
    if (params.source.type === 'customer') {
      const all = await this.getAllTimeEntries()
      entries = all.filter((entry) => !entry.projectId && entry.customerId === params.source.id)
    } else {
      entries = await this.getTimeEntriesByProject(params.source.id)
    }

    const result = {
      total: entries.length,
      movedEntries: 0,
      movedRunningEntries: 0,
      movedMaterialCredits: 0,
      failed: [] as Array<{ timeEntryId: string; error: string }>
    }

    const sourceLabel =
      params.source.type === 'customer'
        ? `Kunde ${entries[0]?.customerName || params.source.id}`
        : `Projekt ${(await this.getProjectById(params.source.id))?.name || params.source.id}`

    let done = 0
    for (const entry of entries) {
      try {
        if (entry.clockOutTime != null) {
          // Vollständiger Umzug inkl. Dateien und Fahrzeugbuchungen
          // eslint-disable-next-line no-await-in-loop
          await this.moveTimeEntryToProject(entry.id, targetProjectId, {
            sourceProjectName: sourceLabel,
            targetProjectName: targetProjectName
          })
          result.movedEntries += 1
        } else {
          // Laufender Satz: Dateien sind noch nicht abgeschlossen, nur umhängen
          // eslint-disable-next-line no-await-in-loop
          await this.updateTimeEntry(entry.id, { projectId: targetProjectId })
          result.movedRunningEntries += 1
        }

        // Kleinauftrags-Kennzeichen lösen, damit der Satz eindeutig zum Projekt
        // gehört (der Kunde hängt weiterhin am Projekt selbst).
        const followUp: Record<string, unknown> = {
          adminCorrectedAt: new Date()
        }
        if (params.correctedBy?.id) followUp.adminCorrectedBy = params.correctedBy.id
        if (params.correctedBy?.name) followUp.adminCorrectedByName = params.correctedBy.name
        if (entry.customerId) {
          followUp.customerId = null
          followUp.customerName = null
          followUp.movedFromCustomerId = entry.customerId
          followUp.movedFromCustomerName = entry.customerName || null
        }
        // eslint-disable-next-line no-await-in-loop
        await this.updateTimeEntry(entry.id, followUp as Partial<TimeEntry>)
      } catch (error: any) {
        result.failed.push({
          timeEntryId: entry.id,
          error: error?.message || 'Unbekannter Fehler'
        })
      } finally {
        done += 1
        params.onProgress?.(done, entries.length)
      }
    }

    // Material-Buchungen des Quellprojekts mitnehmen (nur Projekt → Projekt;
    // Kleinaufträge haben keine projektbezogenen materialCredits).
    if (params.source.type === 'project') {
      try {
        const credits = await this.getMaterialCreditsByProject(params.source.id)
        const maxBatch = 400
        for (let i = 0; i < credits.length; i += maxBatch) {
          const batch = writeBatch(db)
          for (const credit of credits.slice(i, i + maxBatch)) {
            if (!credit.id) continue
            batch.update(doc(db, 'materialCredits', credit.id), { projectId: targetProjectId })
          }
          await batch.commit()
        }
        result.movedMaterialCredits = credits.filter((c) => !!c.id).length
      } catch (error) {
        console.warn('Material-Buchungen konnten nicht umgehängt werden:', error)
      }
    }

    return result
  }

  async deleteTimeEntry(timeEntryId: string): Promise<void> {
    await this.authReadyPromise
    try {
      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      // Mitarbeiter/Tag vor dem Löschen merken, um die Überstunden neu zu berechnen
      let recompute: { employeeId: string; dateKey: string } | null = null
      try {
        const snap = await getDoc(timeEntryRef)
        if (snap.exists()) {
          const entry = snap.data() as TimeEntry
          if (entry.employeeId && entry.clockInTime) {
            recompute = {
              employeeId: entry.employeeId,
              dateKey: this.getDateKeyFromValue(entry.clockInTime)
            }
          }
        }
      } catch {
        /* Recompute ist optional */
      }

      await deleteDoc(timeEntryRef)

      if (recompute) {
        await this.recomputeOvertimeForDay(recompute.employeeId, recompute.dateKey)
      }
    } catch (error) {
      console.error('Fehler beim Löschen des Zeiteintrags:', error)
      throw error
    }
  }

  async getTimeEntryById(timeEntryId: string): Promise<TimeEntry | null> {
    await this.authReadyPromise
    try {
      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      const timeEntryDoc = await getDoc(timeEntryRef)
      
      if (timeEntryDoc.exists()) {
        return { id: timeEntryDoc.id, ...timeEntryDoc.data() } as TimeEntry
      }
      return null
    } catch (error) {
      console.error('Fehler beim Abrufen des Zeiteintrags:', error)
      return null
    }
  }

  private buildStorageObjectPath(
    projectId: string,
    employeeId: string,
    type: string,
    fileName: string
  ): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.jpg'
    return `uploads/${projectId}/${employeeId}/${Date.now()}_${type}_${safeName}`
  }

  private async uploadFileToStorage(file: File, objectPath: string): Promise<string> {
    const objectRef = storageRef(storage, objectPath)
    await uploadBytes(objectRef, file, { contentType: file.type || 'image/jpeg' })
    return getDownloadURL(objectRef)
  }

  private async prepareFileForStorageUpload(file: File, type: string): Promise<File> {
    // Nicht-Bilder (z. B. PDF) niemals durch den Bild-Encoder schicken — das würde hängen.
    if (!this.isCompressibleImage(file)) return file
    const isDocument = this.isDocumentFileType(type)
    // Auf Mobilgeräten schneller, in Storage trotzdem deutlich schärfer als früher
    const maxWidth = isDocument ? 2400 : 1800
    return this.compressImage(file, isDocument ? 0.9 : 0.85, maxWidth, { forceJpeg: true })
  }

  /** Lässt sich die Datei sinnvoll per Canvas rastern/komprimieren? */
  private isCompressibleImage(file: File): boolean {
    const t = (file.type || '').toLowerCase()
    if (t.startsWith('image/')) return t !== 'image/svg+xml'
    // Manche Kamera-/Datei-Apps liefern keinen MIME-Type — dann an der Endung erkennen
    return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '')
  }

  // File Upload — bevorzugt Firebase Storage (volle Qualität), Fallback Base64 in Firestore
  async uploadFile(
    file: File,
    projectId: string,
    employeeId: string,
    type: string = 'construction_site',
    notes: string = '',
    comment: string = '',
    options?: { timeEntryId?: string; onProgress?: (message: string) => void }
  ): Promise<FileUpload> {
    await this.authReadyPromise
    const report = (msg: string) => options?.onProgress?.(msg)
    try {
      const fileUploadsRef = collection(db, 'fileUploads')
      let uploadDataRaw: Record<string, unknown>
      let preparedFile: File | undefined

      try {
        report('Bild wird vorbereitet…')
        preparedFile = await withTimeout(
          this.prepareFileForStorageUpload(file, type),
          IMAGE_PREPARE_TIMEOUT_MS,
          'Die Bildaufbereitung hat zu lange gedauert.'
        )
        const objectPath = this.buildStorageObjectPath(
          projectId,
          employeeId,
          type,
          preparedFile.name
        )
        report('Wird in Firebase Storage hochgeladen…')
        const downloadUrl = await withTimeout(
          this.uploadFileToStorage(preparedFile, objectPath),
          STORAGE_UPLOAD_TIMEOUT_MS,
          'Storage-Upload Zeitüberschreitung'
        )
        uploadDataRaw = {
          fileName: file.name,
          fileType: type,
          projectId,
          employeeId,
          filePath: downloadUrl,
          storagePath: objectPath,
          mimeType: preparedFile.type,
          notes,
          imageComment: comment,
          uploadTime: serverTimestamp()
        }
      } catch (storageError) {
        console.warn('Storage-Upload fehlgeschlagen, Fallback Firestore Base64:', storageError)
        report('Speichere komprimiert in der Datenbank…')
        // Das bereits aufbereitete (verkleinerte) Bild als Ausgangspunkt nehmen, falls vorhanden —
        // so muss das große Original nicht erneut dekodiert werden.
        const sourceForFallback = preparedFile ?? file
        const { base64: base64String, mimeType } = await withTimeout(
          this.compressImageForFirestoreUpload(sourceForFallback, type),
          IMAGE_PREPARE_TIMEOUT_MS,
          'Die Bildkomprimierung hat zu lange gedauert.'
        )
        uploadDataRaw = {
          fileName: file.name,
          fileType: type,
          projectId,
          employeeId,
          base64Data: base64String,
          mimeType,
          notes,
          imageComment: comment,
          uploadTime: serverTimestamp(),
          // Markierung für die automatische Nachmigration: sobald wieder Netz
          // da ist, verschiebt die Selbstheilung (data/maintenance.ts) das
          // Foto nach Storage und entfernt die Base64-Daten.
          needsStorageMigration: true
        }
      }

      if (options?.timeEntryId) {
        uploadDataRaw.timeEntryId = options.timeEntryId
      }
      const uploadData = Object.fromEntries(
        Object.entries(uploadDataRaw).filter(([, v]) => v !== undefined)
      )

      report('Metadaten werden gespeichert…')
      // Kein zusätzlicher getDoc-Readback: spart auf der Baustelle eine Netz-Runde und
      // verhindert ein Hängenbleiben. Die benötigten Werte stehen bereits in uploadDataRaw.
      const docRef = await withTimeout(
        addDoc(fileUploadsRef, uploadData),
        FIRESTORE_WRITE_TIMEOUT_MS,
        'Speichern hat zu lange gedauert — vermutlich schlechtes Netz. Bitte später erneut versuchen.'
      )

      return {
        id: docRef.id,
        fileName: file.name,
        filePath: String(uploadDataRaw.filePath ?? ''),
        fileType: type,
        projectId,
        employeeId,
        timeEntryId: options?.timeEntryId,
        uploadTime: new Date(),
        notes,
        imageComment: comment,
        mimeType: String(uploadDataRaw.mimeType ?? '')
      } as FileUpload
    } catch (error) {
      console.error('Fehler beim Hochladen der Datei:', error)
      throw error
    }
  }

  private isDocumentFileType(type: string): boolean {
    return type === 'invoice' || type === 'delivery_note' || type === 'document'
  }

  /**
   * Dekodiert eine Bilddatei GENAU EINMAL in eine wiederverwendbare Zeichenquelle.
   * Bevorzugt createImageBitmap (dekodiert ausserhalb des Main-Threads, deutlich schneller
   * und schont das Handy), mit robustem Fallback auf ein <img>-Element.
   */
  private async decodeImageSource(
    file: File
  ): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
    if (typeof createImageBitmap === 'function') {
      try {
        // imageOrientation: EXIF-Drehung anwenden (sonst liegen Handy-Fotos quer)
        const bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image'
        } as ImageBitmapOptions)
        if (bitmap.width > 0 && bitmap.height > 0) {
          return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            release: () => bitmap.close()
          }
        }
        bitmap.close()
      } catch {
        // Älterer Browser / nicht unterstütztes Format → <img>-Fallback
      }
    }

    const objectUrl = URL.createObjectURL(file)
    try {
      const img = await this.loadImageElement(objectUrl)
      return {
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        release: () => URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      throw error
    }
  }

  private loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const timer = window.setTimeout(() => {
        img.onload = null
        img.onerror = null
        reject(new Error('Bild konnte nicht rechtzeitig gelesen werden.'))
      }, IMAGE_DECODE_TIMEOUT_MS)
      img.onload = () => {
        window.clearTimeout(timer)
        resolve(img)
      }
      img.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('Bild konnte nicht gelesen werden (beschädigt oder nicht unterstützt).'))
      }
      img.src = src
    })
  }

  /** Zeichnet eine bereits dekodierte Quelle skaliert auf ein Canvas und liefert ein Blob. */
  private renderToBlob(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    quality: number,
    maxWidth: number,
    outputType: string
  ): Promise<Blob | null> {
    let width = sourceWidth
    let height = sourceHeight
    const maxHeight = Math.round(maxWidth * 1.35)
    if (width > maxWidth) {
      height = (height * maxWidth) / width
      width = maxWidth
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height
      height = maxHeight
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const ctx = canvas.getContext('2d')
    if (!ctx) return Promise.resolve(null)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputType, quality)
    })
  }

  private resolveOutputType(file: File, forceJpeg?: boolean): string {
    return forceJpeg || !(file.type || '').includes('png') ? 'image/jpeg' : 'image/png'
  }

  private blobToFile(blob: Blob, originalName: string, outputType: string): File {
    const ext = outputType === 'image/png' ? '.png' : '.jpg'
    const baseName = (originalName || 'upload').replace(/\.[^.]+$/, '') || 'upload'
    return new File([blob], `${baseName}${ext}`, { type: outputType })
  }

  private async blobToBase64Parts(
    blob: Blob,
    fallbackMime: string
  ): Promise<{ base64: string; mimeType: string }> {
    const dataUrl = await this.blobToDataUrl(blob)
    const base64 = dataUrl.split(',')[1] || ''
    const mimeType = dataUrl.split(',')[0]?.split(':')[1]?.split(';')[0] || blob.type || fallbackMime
    return { base64, mimeType }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error('Bilddaten konnten nicht gelesen werden.'))
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Komprimiert so stark wie nötig, damit base64Data in Firestore passt (~1 MiB pro Feld).
   * Startet mit hoher Qualität und reduziert schrittweise Breite/Qualität.
   */
  private async compressImageForFirestoreUpload(
    file: File,
    type: string
  ): Promise<{ base64: string; mimeType: string }> {
    const isDocument = this.isDocumentFileType(type)
    let quality = isDocument ? 0.88 : 0.8
    let maxWidth = isDocument ? 1800 : 1400
    const minQuality = 0.42
    const minWidth = 640
    // base64 ist ~4/3 der Rohbytes — daraus die zulässige Blob-Grösse ableiten, statt
    // bei jedem Versuch teuer base64 zu kodieren (nur das Gewinner-Blob wird kodiert).
    const maxBlobBytes = Math.floor((FIRESTORE_MAX_BASE64_BYTES * 3) / 4)
    const outputType = 'image/jpeg'

    // Bild nur EINMAL dekodieren und für alle Versuche wiederverwenden — das war bisher
    // der Flaschenhals (bis zu 12 Dekodierungen des Originals auf dem Handy → Timeout).
    const decoded = await this.decodeImageSource(file)
    try {
      let smallestBlob: Blob | null = null
      for (let attempt = 0; attempt < 12; attempt++) {
        const blob = await this.renderToBlob(
          decoded.source,
          decoded.width,
          decoded.height,
          quality,
          maxWidth,
          outputType
        )
        if (blob) {
          if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob
          if (blob.size <= maxBlobBytes) {
            if (isDevMode && attempt > 0) {
              console.log(
                `Bild komprimiert (${attempt + 1}. Versuch): ${Math.round(blob.size / 1024)} KB`
              )
            }
            return this.blobToBase64Parts(blob, outputType)
          }
        }

        if (quality > minQuality + 0.08) {
          quality -= 0.1
        } else if (maxWidth > minWidth) {
          maxWidth = Math.max(minWidth, Math.round(maxWidth * 0.72))
          quality = isDocument ? 0.78 : 0.7
        } else {
          break
        }
      }

      // Selbst die kleinste Variante nehmen, sofern sie noch unter dem harten Firestore-Limit liegt.
      if (smallestBlob) {
        const parts = await this.blobToBase64Parts(smallestBlob, outputType)
        if (parts.base64.length <= FIRESTORE_MAX_BASE64_BYTES) return parts
      }
    } finally {
      decoded.release()
    }

    throw new Error(
      'Das Bild ist zu groß für die Datenbank (max. ca. 1 MB pro Foto). Bitte näher heranzoomen, weniger Bilder auf einmal speichern oder die Kamera-Auflösung reduzieren.'
    )
  }

  private async compressImage(
    file: File,
    quality: number,
    maxWidth: number,
    options?: { forceJpeg?: boolean }
  ): Promise<File> {
    const decoded = await this.decodeImageSource(file)
    try {
      const outputType = this.resolveOutputType(file, options?.forceJpeg)
      const blob = await this.renderToBlob(
        decoded.source,
        decoded.width,
        decoded.height,
        quality,
        maxWidth,
        outputType
      )
      // Falls toBlob fehlschlägt: lieber das Original hochladen als gar nichts.
      return blob ? this.blobToFile(blob, file.name, outputType) : file
    } finally {
      decoded.release()
    }
  }

  // Live Documentation
  async addLiveDocumentationToTimeEntry(
    timeEntryId: string,
    documentationData: {
      notes: string
      images: any[]
      documents: any[]
      photoCount: number
      documentCount: number
      addedBy: string
      addedByName: string
    }
  ): Promise<void> {
    await this.authReadyPromise
    try {
      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      const timeEntryDoc = await getDoc(timeEntryRef)
      
      if (!timeEntryDoc.exists()) {
        throw new Error('Zeiteintrag nicht gefunden')
      }

      // Nur IDs + Text — keine Bilddaten im timeEntry (Firestore-Max. 1 MiB pro Dokument)
      const newDocumentation = {
        notes: documentationData.notes || '',
        photoCount: documentationData.photoCount,
        documentCount: documentationData.documentCount,
        addedBy: documentationData.addedBy,
        addedByName: documentationData.addedByName,
        imageIds: (documentationData.images || [])
          .map((img: { id?: string }) => img?.id)
          .filter((id): id is string => !!id),
        documentIds: (documentationData.documents || [])
          .map((doc: { id?: string }) => doc?.id)
          .filter((id): id is string => !!id),
        timestamp: Timestamp.now()
      }

      await updateDoc(timeEntryRef, {
        liveDocumentation: arrayUnion(newDocumentation),
        hasDocumentation: true,
        lastLiveDocumentationAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Live-Dokumentation:', error)
      throw error
    }
  }

  /** Bearbeitet den Text eines bestehenden Live-Dokumentations-Berichts (z. B. durch den Mitarbeiter). */
  async updateLiveDocumentationNotes(
    timeEntryId: string,
    index: number,
    notes: string
  ): Promise<void> {
    await this.authReadyPromise
    try {
      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      const timeEntryDoc = await getDoc(timeEntryRef)

      if (!timeEntryDoc.exists()) {
        throw new Error('Zeiteintrag nicht gefunden')
      }

      const live = [...((timeEntryDoc.data().liveDocumentation as any[]) || [])]
      if (!live[index]) {
        throw new Error('Bericht nicht gefunden')
      }

      // serverTimestamp() ist in Array-Elementen nicht erlaubt → Timestamp.now()
      live[index] = { ...live[index], notes, editedAt: Timestamp.now() }

      await updateDoc(timeEntryRef, { liveDocumentation: live })
    } catch (error) {
      console.error('Fehler beim Bearbeiten des Berichts:', error)
      throw error
    }
  }

  // Material types (Verbrauchsmaterial für Ausstempeln / Nachkalkulation)
  // ==================== MATERIAL (data/materials.ts) ====================
  getActiveMaterialTypes(): Promise<MaterialType[]> {
    return materials.getActiveMaterialTypes()
  }

  getAllMaterialTypes(): Promise<MaterialType[]> {
    return materials.getAllMaterialTypes()
  }

  createMaterialType(data: Partial<MaterialType>): Promise<string> {
    return materials.createMaterialType(data)
  }

  updateMaterialType(id: string, data: Partial<MaterialType>): Promise<void> {
    return materials.updateMaterialType(id, data)
  }

  deleteMaterialType(id: string): Promise<void> {
    return materials.deleteMaterialType(id)
  }

  deleteAllMaterialTypes(options?: { onlyHero?: boolean }): Promise<number> {
    return materials.deleteAllMaterialTypes(options)
  }

  getMaterialCreditsByProject(projectId: string): Promise<MaterialCredit[]> {
    return materials.getMaterialCreditsByProject(projectId)
  }

  getAllMaterialCredits(): Promise<MaterialCredit[]> {
    return materials.getAllMaterialCredits()
  }

  addMaterialCredit(data: Partial<MaterialCredit>): Promise<MaterialCredit> {
    return materials.addMaterialCredit(data)
  }

  deleteMaterialCredit(id: string): Promise<void> {
    return materials.deleteMaterialCredit(id)
  }

  // ==================== KUNDEN (data/customers.ts) ====================
  getAllCustomers(): Promise<Customer[]> {
    return customers.getAllCustomers()
  }

  getActiveCustomers(): Promise<Customer[]> {
    return customers.getActiveCustomers()
  }

  getCustomerById(id: string): Promise<Customer | null> {
    return customers.getCustomerById(id)
  }

  createCustomer(customerData: Partial<Customer>): Promise<string> {
    return customers.createCustomer(customerData)
  }

  updateCustomer(id: string, customerData: Partial<Customer>): Promise<void> {
    return customers.updateCustomer(id, customerData)
  }

  deleteCustomer(id: string): Promise<void> {
    return customers.deleteCustomer(id)
  }

  // ==================== FAHRZEUGE (data/vehicles.ts) ====================
  getAllVehicles(): Promise<Vehicle[]> {
    return vehicles.getAllVehicles()
  }

  createVehicle(vehicleData: Partial<Vehicle>): Promise<string> {
    return vehicles.createVehicle(vehicleData)
  }

  updateVehicle(id: string, vehicleData: Partial<Vehicle>): Promise<void> {
    return vehicles.updateVehicle(id, vehicleData)
  }

  deleteVehicle(id: string): Promise<void> {
    return vehicles.deleteVehicle(id)
  }

  getVehicleUsagesByProject(projectId: string): Promise<VehicleUsage[]> {
    return vehicles.getVehicleUsagesByProject(projectId)
  }

  getVehicleUsagesByEmployeeId(employeeId: string): Promise<VehicleUsage[]> {
    return vehicles.getVehicleUsagesByEmployeeId(employeeId)
  }

  getVehicleUsagesByTimeEntryId(timeEntryId: string): Promise<VehicleUsage[]> {
    return vehicles.getVehicleUsagesByTimeEntryId(timeEntryId)
  }

  addVehicleUsage(usageData: Partial<VehicleUsage>): Promise<VehicleUsage> {
    return vehicles.addVehicleUsage(usageData)
  }

  // ==================== ADMIN-SESSION (data/session.ts) ====================
  async getCurrentAdmin(): Promise<session.AdminSession | null> {
    return session.getCurrentAdmin()
  }

  setCurrentAdmin(admin: session.AdminSession | null) {
    session.setCurrentAdmin(admin)
  }

  clearCurrentAdmin() {
    session.clearCurrentAdmin()
  }

  saveAdminPushSubscription(
    subscription: PushSubscriptionJSON,
    admin: { id?: string; username?: string; name?: string }
  ): Promise<void> {
    return session.saveAdminPushSubscription(subscription, admin)
  }

  removeAdminPushSubscription(endpoint: string): Promise<void> {
    return session.removeAdminPushSubscription(endpoint)
  }

  saveEmployeePushSubscription(
    subscription: PushSubscriptionJSON,
    employee: { id?: string; username?: string; name?: string }
  ): Promise<void> {
    return session.saveEmployeePushSubscription(subscription, employee)
  }

  removeEmployeePushSubscription(endpoint: string): Promise<void> {
    return session.removeEmployeePushSubscription(endpoint)
  }

  // ============ MONATSEND-ERINNERUNG (data/overtimeBroadcast.ts) ============
  getOvertimeReminderBroadcast(): Promise<overtimeBroadcast.OvertimeReminderBroadcast | null> {
    return overtimeBroadcast.getOvertimeReminderBroadcast()
  }

  subscribeToOvertimeReminderBroadcast(
    onBroadcast: (broadcast: overtimeBroadcast.OvertimeReminderBroadcast | null) => void
  ): () => void {
    return overtimeBroadcast.subscribeToOvertimeReminderBroadcast(onBroadcast)
  }

  triggerOvertimeReminderBroadcast(
    month: string,
    triggeredByName?: string
  ): Promise<overtimeBroadcast.TriggerBroadcastResult> {
    return overtimeBroadcast.triggerOvertimeReminderBroadcast(month, triggeredByName)
  }

  authenticateAdmin(username: string, password: string): Promise<session.AdminSession | null> {
    return session.authenticateAdmin(username, password)
  }

  // ==================== MITARBEITER (data/employees.ts) ====================
  getAllEmployees(): Promise<Employee[]> {
    return employees.getAllEmployees()
  }

  getAllActiveEmployees(): Promise<Employee[]> {
    return employees.getAllActiveEmployees()
  }

  createEmployee(employeeData: Partial<Employee>): Promise<string> {
    return employees.createEmployee(employeeData)
  }

  updateEmployee(id: string, employeeData: Partial<Employee>): Promise<void> {
    return employees.updateEmployee(id, employeeData)
  }

  getEmployeeById(id: string): Promise<Employee | null> {
    return employees.getEmployeeById(id)
  }

  deleteEmployee(id: string): Promise<void> {
    return employees.deleteEmployee(id)
  }

  // ==================== PROJEKTE CRUD (data/projects.ts) ====================
  getAllProjects(): Promise<Project[]> {
    return projects.getAllProjects()
  }

  createProject(projectData: Partial<Project>): Promise<string> {
    return projects.createProject(projectData)
  }

  updateProject(id: string, projectData: Partial<Project> & Record<string, unknown>): Promise<void> {
    return projects.updateProject(id, projectData)
  }

  deleteProject(id: string): Promise<void> {
    return projects.deleteProject(id)
  }

  // ==================== URLAUB (data/leave.ts) ====================
  getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    return leave.getLeaveRequestsByEmployee(employeeId)
  }

  getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return leave.getAllLeaveRequests()
  }

  // --- Admin-Dashboard (kontoweite Widget-Anordnung) ---
  loadAdminDashboard(adminKey: string) {
    return dashboard.loadAdminDashboard(adminKey)
  }

  saveAdminDashboard(adminKey: string, widgets: DashboardWidgetInstance[]) {
    return dashboard.saveAdminDashboard(adminKey, widgets)
  }

  createLeaveRequest(requestData: Partial<LeaveRequest>): Promise<string> {
    return leave.createLeaveRequest(requestData)
  }

  /** Krankmeldung durch den Admin – wird direkt als genehmigt gespeichert. */
  reportSickLeave(data: {
    employeeId: string
    employeeName?: string
    startDate: Date
    endDate: Date
    reason?: string
    reportedBy?: string
  }): Promise<string> {
    return leave.reportSickLeave(data)
  }

  /** Berufsschultage eines Azubis – ebenfalls direkt genehmigt gespeichert. */
  reportSchoolDays(data: {
    employeeId: string
    employeeName?: string
    startDate: Date
    endDate: Date
    reason?: string
    reportedBy?: string
  }): Promise<string> {
    return leave.reportSchoolDays(data)
  }

  updateLeaveRequest(id: string, requestData: Partial<LeaveRequest>): Promise<void> {
    return leave.updateLeaveRequest(id, requestData)
  }

  approveLeaveRequest(id: string, approvedBy: string): Promise<void> {
    return leave.approveLeaveRequest(id, approvedBy)
  }

  rejectLeaveRequest(id: string, rejectionReason: string): Promise<void> {
    return leave.rejectLeaveRequest(id, rejectionReason)
  }

  deleteLeaveRequest(id: string): Promise<void> {
    return leave.deleteLeaveRequest(id)
  }

  // ==================== ABRECHNUNGEN (data/settlements.ts) ====================
  settlementDocId(employeeId: string, periodStart: string, periodEnd: string): string {
    return settlements.settlementDocId(employeeId, periodStart, periodEnd)
  }

  saveTimeReportSettlement(
    data: Omit<TimeReportSettlement, 'id' | 'settledAt'>,
    options?: { alreadyBookedMinutes?: number }
  ): Promise<void> {
    return settlements.saveTimeReportSettlement(data, options)
  }

  getTimeReportSettlement(
    employeeId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<TimeReportSettlement | null> {
    return settlements.getTimeReportSettlement(employeeId, periodStart, periodEnd)
  }

  calculateWorkingDays(startDate: Date, endDate: Date): number {
    return settlements.calculateWorkingDays(startDate, endDate)
  }

  // ============ ÜBERSTUNDEN-VERRECHNUNG (data/overtimeSettlements.ts) ============
  getOvertimeSettlements(employeeId: string): Promise<OvertimeSettlement[]> {
    return overtimeSettlements.getOvertimeSettlements(employeeId)
  }

  getOvertimeSettlement(employeeId: string, month: string): Promise<OvertimeSettlement | null> {
    return overtimeSettlements.getOvertimeSettlement(employeeId, month)
  }

  setOvertimeSettlementMinutes(
    employeeId: string,
    month: string,
    minutes: number,
    workedMinutes: number
  ): Promise<number> {
    return overtimeSettlements.setOvertimeSettlementMinutes(
      employeeId,
      month,
      minutes,
      workedMinutes
    )
  }

  /** Im Monat geleistete Arbeitszeit – Grundlage der Abrechnungsmeldung. */
  async getWorkedMinutesForMonth(employeeId: string, month: string): Promise<number> {
    await this.authReadyPromise
    if (!employeeId || !month) return 0
    const [year, mon] = month.split('-').map(Number)
    if (!year || !mon) return 0
    const entries = await this.getTimeEntriesByEmployeeId(employeeId, {
      from: new Date(year, mon - 1, 1),
      to: new Date(year, mon, 0, 23, 59, 59, 999)
    })
    return workedMinutesForMonth(entries, month)
  }

  // Admin: Dashboard-Daten
  async getCurrentTimeEntries(): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(timeEntriesRef, where('clockOutTime', '==', null))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map((doc) =>
        sanitizeTimeEntryForRead({ id: doc.id, ...doc.data() } as TimeEntry)
      )
    } catch (error) {
      console.error('Fehler beim Abrufen der aktuellen Zeiteinträge:', error)
      return []
    }
  }

  async getTodaysTimeEntries(): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(
        timeEntriesRef,
        where('clockInTime', '>=', Timestamp.fromDate(today)),
        where('clockInTime', '<', Timestamp.fromDate(tomorrow))
      )
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map((doc) =>
        sanitizeTimeEntryForRead({ id: doc.id, ...doc.data() } as TimeEntry)
      )
    } catch (error) {
      console.error('Fehler beim Abrufen der heutigen Zeiteinträge:', error)
      return []
    }
  }

  calculateTotalWorkHours(entries: TimeEntry[]): number {
    let totalHours = 0
    
    entries.forEach(entry => {
      if (entry.clockOutTime) {
        const clockIn = entry.clockInTime instanceof Timestamp
          ? entry.clockInTime.toDate()
          : entry.clockInTime instanceof Date
          ? entry.clockInTime
          : new Date(entry.clockInTime)
        
        const clockOut = entry.clockOutTime instanceof Timestamp
          ? entry.clockOutTime.toDate()
          : entry.clockOutTime instanceof Date
          ? entry.clockOutTime
          : new Date(entry.clockOutTime)

        // Zeiten auf 15-Min-Raster glätten (einheitliche Basis)
        const diffMs = roundedSpanMs(clockIn, clockOut)
        const pauseTotalTime = entry.pauseTotalTime || 0
        const actualWorkTime = diffMs - pauseTotalTime + getReturnTravelCreditMs(entry)
        const hours = actualWorkTime / (1000 * 60 * 60)
        // Negative Arbeitszeit (Pause länger als gestempelte Zeit) nicht vom
        // Gesamttotal abziehen – konsistent mit der Überstunden-Berechnung.
        totalHours += hours > 0 ? hours : 0
      }
    })
    
    return totalHours
  }

  async getTimeEntriesByProject(projectId: string, range?: TimeEntryDateRange): Promise<TimeEntry[]> {
    return this.queryTimeEntries('projectId', projectId, range)
  }

  // Projekt-Dateien laden (wie in der alten App - aus Zeiteinträgen und zusätzlich direkt per projectId)
  async getFileUploadById(
    id: string,
    opts?: FileUploadLoadOptions
  ): Promise<FileUpload | null> {
    await this.authReadyPromise
    if (!id?.trim() || isPlaceholderFileUploadId(id)) return null
    try {
      const snap = await getDoc(doc(db, 'fileUploads', id.trim()))
      if (!snap.exists()) return null
      return this.fileUploadFromDocData(snap.id, snap.data() as Record<string, unknown>, {
        includeBinary: opts?.includeBinary === true
      })
    } catch (error) {
      console.error(`Fehler beim Laden von fileUpload ${id}:`, error)
      return null
    }
  }


  /**
   * Ergänzt Anzeige-URLs für Dateien, die ohne includeBinary geladen wurden
   * (Firebase-Storage-Pfad, fehlende Download-URL oder Legacy-Base64).
   */
  async enrichFilesForDisplay(files: FileUpload[]): Promise<FileUpload[]> {
    await this.authReadyPromise
    return Promise.all(
      files.map(async (file) => {
        if (getFileImageSrc(file)) return file

        if (file.storagePath) {
          try {
            const url = await getDownloadURL(storageRef(storage, file.storagePath))
            return { ...file, filePath: url }
          } catch (error) {
            if (isDevMode) {
              console.warn('Storage-URL konnte nicht aufgelöst werden:', file.storagePath, error)
            }
          }
        }

        if (file.id) {
          const full = await this.getFileUploadById(file.id, { includeBinary: true })
          if (full && getFileImageSrc(full)) return full
        }

        return file
      })
    )
  }

  // Projekt-Dateien laden (wie in der alten App - aus Zeiteinträgen und zusätzlich direkt per projectId)
  async getProjectFiles(
    projectId: string,
    type: string = 'construction_site',
    opts?: FileUploadLoadOptions
  ): Promise<FileUpload[]> {
    await this.authReadyPromise
    const includeBinary = opts?.includeBinary === true
    try {
      if (!projectId) {
        console.error('Keine Projekt-ID angegeben')
        return []
      }

      const normalizedType = type === 'photo' ? 'construction_site' : type
      const files: FileUpload[] = []
      const seenIds = new Set<string>()

      try {
        const uploadsByProject = await this.getFileUploads(projectId, undefined, {
          includeBinary
        })
        for (const u of uploadsByProject) {
          if (u.id && !seenIds.has(u.id)) {
            seenIds.add(u.id)
            files.push(u)
          }
        }
      } catch (extraErr) {
        if (isDevMode) {
          console.warn('Konnte Dateien über projectId nicht laden:', extraErr)
        }
      }

      const timeEntries = await this.getTimeEntriesByProject(projectId)
      if (!timeEntries || timeEntries.length === 0) {
        if (isDevMode) {
          console.log('Keine Zeiteinträge für Projekt gefunden:', projectId)
        }
      }

      let fileIds: string[] = []
      let directFiles: any[] = []

      timeEntries.forEach((entry) => {
        try {
          if (normalizedType === 'construction_site') {
            // Sammle sitePhotoUploads IDs
            if (entry.sitePhotoUploads && Array.isArray(entry.sitePhotoUploads)) {
              fileIds = [...fileIds, ...entry.sitePhotoUploads.filter((id: any) => id && typeof id === 'string')]
            }
            // Sammle photos (können IDs oder Objekte sein)
            if (entry.photos && Array.isArray(entry.photos)) {
              if (entry.photos.length > 0 && typeof entry.photos[0] === 'object' && entry.photos[0] !== null && (entry.photos[0] as any).url) {
                // Direkte Foto-Objekte
                entry.photos.forEach((photo: any) => {
                  if (photo && typeof photo === 'object') {
                    directFiles.push({
                      ...photo,
                      timeEntryId: entry.id,
                      employeeId: entry.employeeId,
                      timestamp: entry.clockOutTime || entry.clockInTime,
                      fileType: 'construction_site'
                    })
                  }
                })
              } else {
                // Foto-IDs
                const photoIds = entry.photos.filter((id: any) => id && (typeof id === 'string' || typeof id === 'number'))
                fileIds = [...fileIds, ...photoIds.map((id: any) => String(id))]
              }
            }
            // Sammle sitePhotos (neue Struktur)
            if (entry.sitePhotos && Array.isArray(entry.sitePhotos)) {
              entry.sitePhotos.forEach((photo: any) => {
                if (photo && typeof photo === 'object') {
                  if (photo.id) {
                    fileIds.push(String(photo.id))
                  } else if (photo.url || photo.base64Data) {
                    directFiles.push({
                      ...photo,
                      timeEntryId: entry.id,
                      employeeId: entry.employeeId,
                      timestamp: entry.clockOutTime || entry.clockInTime,
                      fileType: 'construction_site'
                    })
                  }
                }
              })
            }
          } else if (normalizedType === 'document' || normalizedType === 'delivery_note') {
            // Sammle documentPhotoUploads IDs
            if (entry.documentPhotoUploads && Array.isArray(entry.documentPhotoUploads)) {
              fileIds = [...fileIds, ...entry.documentPhotoUploads.filter((id: any) => id && typeof id === 'string')]
            }
            // Sammle documents (können IDs oder Objekte sein)
            if (entry.documents && Array.isArray(entry.documents)) {
              if (entry.documents.length > 0 && typeof entry.documents[0] === 'object' && entry.documents[0] !== null && (entry.documents[0] as any).url) {
                // Direkte Dokument-Objekte
                entry.documents.forEach((doc: any) => {
                  if (doc && typeof doc === 'object') {
                    directFiles.push({
                      ...doc,
                      timeEntryId: entry.id,
                      employeeId: entry.employeeId,
                      timestamp: entry.clockOutTime || entry.clockInTime,
                      fileType: 'document'
                    })
                  }
                })
              } else {
                // Dokument-IDs
                const docIds = entry.documents.filter((id: any) => id && (typeof id === 'string' || typeof id === 'number'))
                fileIds = [...fileIds, ...docIds.map((id: any) => String(id))]
              }
            }
          }
        } catch (entryError) {
          console.error('Fehler beim Verarbeiten eines Zeiteintrags:', entryError, entry)
        }
      })

      // Alle Uploads mit timeEntryId zu Stempelsätzen dieses Projekts (falls Arrays im Eintrag unvollständig sind)
      const entryIdsForProject = timeEntries.map((e) => e.id).filter(Boolean) as string[]
      if (entryIdsForProject.length > 0) {
        const linkedByTimeEntry = await this.getFileUploadsByTimeEntryIds(entryIdsForProject, {
          includeBinary
        })
        for (const u of linkedByTimeEntry) {
          if (u.id) fileIds.push(u.id)
        }
      }

      // Entferne Duplikate und bereits geladene IDs
      fileIds = [...new Set(fileIds)].filter((id) => !seenIds.has(id))

      if (fileIds.length > 0) {
        if (isDevMode) {
          console.log(`Lade ${fileIds.length} Dateien für Projekt ${projectId}, Typ: ${normalizedType}`)
        }

        const chunkSize = 10
        for (let i = 0; i < fileIds.length; i += chunkSize) {
          const chunk = fileIds.slice(i, i + chunkSize).filter((id) => !!id)
          if (chunk.length === 0) continue

          const chunkQuery = query(collection(db, 'fileUploads'), where(documentId(), 'in', chunk))
          const chunkSnapshot = await getDocs(chunkQuery)

          chunkSnapshot.forEach((fileDoc) => {
            const data = fileDoc.data() as Record<string, unknown>
            files.push(
              this.fileUploadFromDocData(fileDoc.id, data, {
                projectIdFallback: projectId,
                fileTypeFallback: normalizedType,
                includeBinary
              })
            )
            seenIds.add(fileDoc.id)
          })

          if (isDevMode && chunkSnapshot.size < chunk.length) {
            console.warn(
              `Nicht alle Datei-IDs wurden gefunden (Projekt ${projectId}):`,
              { expected: chunk.length, loaded: chunkSnapshot.size }
            )
          }
        }

        if (isDevMode) {
          console.log(`${files.length} Datei-Datensätze für Referenz-IDs geladen`)
        }
      }

      // Füge direkte Dateien hinzu (Legacy in Zeiteinträgen eingebettet)
      directFiles.forEach((file) => {
        const filePath = String(file.url || file.filePath || '')
        const legacyBase64 = includeBinary ? file.base64Data || file.base64 : undefined
        files.push({
          id: file.id || `direct-${Date.now()}-${Math.random()}`,
          fileName: file.fileName || file.name || 'Unbekannt',
          filePath: filePath.startsWith('data:') ? '' : filePath,
          fileType: file.fileType || normalizedType,
          projectId: file.projectId || projectId,
          employeeId: file.employeeId || '',
          uploadTime: file.timestamp ? this.convertToDate(file.timestamp) : new Date(),
          notes: file.notes || file.comment || '',
          imageComment: file.imageComment || file.comment || '',
          base64Data: legacyBase64,
          mimeType: file.mimeType || file.type || 'image/jpeg'
        } as FileUpload)
      })

      // Endgültig nach Typ filtern (falls kein typ gesetzt, anhand mimeType raten)
      let filteredFiles = files.filter((f) => {
        const fileType = (f.fileType || '').toLowerCase()
        let mime = (f.mimeType || '').toLowerCase()
        const fileName = (f.fileName || '').toLowerCase()
        
        // Bereinige mimeType falls es ein data URL ist (z.B. "data:image/jpeg;base64" → "image/jpeg")
        if (mime.startsWith('data:')) {
          const match = mime.match(/^data:([^;,]+)/)
          if (match) {
            mime = match[1]
          }
        }

        if (normalizedType === 'construction_site') {
          // Prüfe verschiedene Kriterien für Fotos
          const isPhotoByType = fileType === 'construction_site' || fileType === 'site_photo' || fileType === 'photo' || fileType === 'baustellenfoto' || fileType === 'baustelle'
          const isPhotoByMime = mime.startsWith('image/') || fileType.startsWith('image/')
          const isPhotoByExtension = fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
          const isPhotoByBase64 = f.base64Data && (!mime || mime.startsWith('image/'))
          
          const isPhoto = isPhotoByType || isPhotoByMime || isPhotoByExtension || isPhotoByBase64
          return isPhoto
        }

        if (normalizedType === 'document' || normalizedType === 'delivery_note') {
          // Dokumente: alles was KEIN Bild ist
          const isImage = mime.startsWith('image/') || fileType.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
          const isDoc = fileType === 'document' || fileType === 'invoice' || fileType === 'delivery_note' || fileType === 'rechnung' || fileType === 'lieferschein' || fileType === 'dokument' || !isImage
          return isDoc
        }

        // Fallback: wenn Typ unbekannt, alles durchlassen
        return true
      })

      // Dedupliziere nach id (falls über Zeiteinträge + direct + projectId doppelt)
      const dedupeKeys = new Set<string>()
      filteredFiles = filteredFiles.filter((f) => {
        const key = f.id || `${f.fileName}-${f.projectId}`
        if (dedupeKeys.has(key)) return false
        dedupeKeys.add(key)
        return true
      })

      // Sortiere nach Datum (neueste zuerst)
      filteredFiles.sort((a, b) => {
        const dateA = a.uploadTime instanceof Date ? a.uploadTime.getTime() : new Date(a.uploadTime).getTime()
        const dateB = b.uploadTime instanceof Date ? b.uploadTime.getTime() : new Date(b.uploadTime).getTime()
        return dateB - dateA
      })

      return filteredFiles
    } catch (error) {
      console.error(`Fehler beim Abrufen der Projekt-Dateien für ${projectId}:`, error)
      return []
    }
  }

  // Hilfsfunktion zum Konvertieren von Timestamps
  private convertToDate(timestamp: unknown): Date {
    return sharedConvertToDate(timestamp)
  }

  async getAllTimeEntries(): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const timeEntriesRef = collection(db, 'timeEntries')
      const snapshot = await getDocs(timeEntriesRef)
      
      return snapshot.docs.map((doc) =>
        sanitizeTimeEntryForRead({ id: doc.id, ...doc.data() } as TimeEntry)
      )
    } catch (error) {
      console.error('Fehler beim Abrufen aller Zeiteinträge:', error)
      return []
    }
  }

  /** Alle fileUploads, die explizit an einen Stempelsatz gebunden sind (auch wenn projectId/Arrays abweichen). */
  async getFileUploadsByTimeEntryIds(
    timeEntryIds: string[],
    opts?: FileUploadLoadOptions
  ): Promise<FileUpload[]> {
    await this.authReadyPromise
    if (!timeEntryIds || timeEntryIds.length === 0) return []
    const includeBinary = opts?.includeBinary === true
    const out: FileUpload[] = []
    const chunkSize = 10
    for (let i = 0; i < timeEntryIds.length; i += chunkSize) {
      const chunk = timeEntryIds.slice(i, i + chunkSize).filter((id) => !!id)
      if (chunk.length === 0) continue
      try {
        const fileUploadsRef = collection(db, 'fileUploads')
        const q = query(fileUploadsRef, where('timeEntryId', 'in', chunk))
        const snapshot = await getDocs(q)
        snapshot.docs.forEach((fileDoc) => {
          const data = fileDoc.data() as Record<string, unknown>
          out.push(
            this.fileUploadFromDocData(fileDoc.id, data, {
              fileTypeFallback: 'construction_site',
              includeBinary
            })
          )
        })
      } catch (e) {
        console.error('getFileUploadsByTimeEntryIds:', e)
      }
    }
    return out
  }

  async getFileUploads(
    projectId?: string,
    type?: string,
    opts?: FileUploadLoadOptions
  ): Promise<FileUpload[]> {
    await this.authReadyPromise
    try {
      const fileUploadsRef = collection(db, 'fileUploads')
      let q: any = fileUploadsRef
      
      if (projectId) {
        q = query(fileUploadsRef, where('projectId', '==', projectId))
      }
      
      const snapshot = await getDocs(q)
      let uploads = snapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>

        return this.fileUploadFromDocData(doc.id, data, {
          includeBinary: opts?.includeBinary === true
        })
      })

      if (type) {
        uploads = uploads.filter((upload) => upload.fileType === type)
      }

      return uploads
    } catch (error) {
      console.error('Fehler beim Abrufen der Datei-Uploads:', error)
      return []
    }
  }

  // ==================== HERO (data/hero.ts) ====================
  getHeroIntegrationConfig(): Promise<HeroIntegrationConfig | null> {
    return hero.getHeroIntegrationConfig()
  }

  getHeroSyncLogs(limit = 10): Promise<HeroSyncLogEntry[]> {
    return hero.getHeroSyncLogs(limit)
  }
}

export const DataService = new DataServiceClass()

