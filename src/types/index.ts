/** Status der Rückübertragung erfasster Zeiten an HERO (Export folgt in späterer Phase). */
export type HeroSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'

export interface HeroIntegrationConfig {
  lastProjectSyncAt?: Date | any
  lastProjectSyncError?: string | null
  lastProjectSyncStats?: {
    created: number
    updated: number
    archived: number
    skipped: number
    total: number
  }
}

export interface HeroSyncLogEntry {
  id?: string
  type: 'projects' | 'health' | 'times'
  success: boolean
  message?: string
  stats?: Record<string, number>
  error?: string
  createdAt?: Date | any
}

export interface Employee {
  id?: string
  username: string
  password?: string
  name?: string
  firstName?: string
  lastName?: string
  hourlyWage?: number
  hourlyRate?: number
  position?: string
  isAdmin?: boolean
  status?: 'active' | 'inactive'
  /** HERO-Kontakt-ID für späteren Zeit-Export */
  heroEmployeeId?: string
  heroContactNr?: string
  vacationDays?: {
    total: number
    used: number
    year: number
  }
  /** Optional: Überstunden-Saldo in Minuten (wird bei Zeiterfassungs-Abrechnung reduziert, falls gesetzt). */
  overtimeBalanceMinutes?: number | null
}

export interface Project {
  id: string
  name?: string
  client?: string
  location?: string
  address?: string
  startDate?: any
  endDate?: any
  description?: string
  isActive?: boolean
  status?: 'active' | 'inactive' | 'aktiv' | 'planned' | 'completed' | 'archived'
  /** HERO project_matches.id */
  heroProjectId?: string
  heroProjectNr?: string
  heroLastSyncedAt?: Date | any
  heroSyncSource?: 'hero'
  heroStatusCode?: number
  heroStatusName?: string
}

/** Verbrauchsmaterial beim Ausstempeln (Stückliste für Nachkalkulation) */
export interface TimeEntryMaterialUsage {
  materialTypeId: string
  materialName?: string
  unitLabel?: string
  quantity: number
  unitPriceEur?: number
}

export interface MaterialType {
  id: string
  name: string
  /** z. B. m², Stück, Sack */
  unitLabel?: string
  /** Preis pro Mengeneinheit (EUR) */
  unitPriceEur?: number
  isActive?: boolean
  sortOrder?: number
}

export interface TimeEntry {
  id: string
  employeeId: string
  projectId: string
  clockInTime: Date | any
  clockOutTime?: Date | any | null
  clockInLocation?: { lat: number | null; lng: number | null } | null
  clockOutLocation?: { lat: number | null; lng: number | null } | null
  locationOut?: { lat: number | null; lng: number | null } | null
  notes?: string
  /** Beim Ausstempeln erfasstes Material (qm, Stück, …) */
  materialUsages?: TimeEntryMaterialUsage[]
  pauseTotalTime?: number
  pauseDetails?: Array<{
    start: any
    end: any
    duration: number
    startedBy?: string
    endedBy?: string
  }>
  sitePhotoUploads?: string[]
  documentPhotoUploads?: string[]
  sitePhotos?: any[]
  documents?: any[]
  photos?: any[] | string[]
  hasDocumentation?: boolean
  isVacationDay?: boolean
  liveDocumentation?: Array<{
    notes: string
    images: any[]
    documents: any[]
    photoCount: number
    documentCount: number
    addedBy: string
    addedByName: string
    timestamp: any
  }>
  /** Nachtrag durch befugte Kollegen (nicht Admin) */
  manualTimeEntry?: boolean
  manualTimeEntryAddedByEmployeeId?: string
  manualTimeEntryAddedByDisplayName?: string
  manualTimeEntryCreatedAt?: any
  /** Warteschlange für HERO-Zeit-Export (noch nicht implementiert) */
  heroSyncStatus?: HeroSyncStatus
  heroSyncedAt?: Date | any
  heroSyncError?: string
  heroExternalRef?: string
}

export interface Vehicle {
  id: string
  name: string
  type?: string
  licensePlate?: string
  hourlyRate?: number
  isActive?: boolean
}

export interface VehicleUsage {
  id: string
  vehicleId: string
  vehicleName?: string
  employeeId: string
  projectId: string
  /** Optional: Zuordnung zum Stempelsatz (Umzug & Auswertung) */
  timeEntryId?: string
  date: string | Date | any
  hours?: number
  hoursUsed?: number
  comment?: string
}

export interface FileUpload {
  id: string
  fileName: string
  filePath: string
  fileType: string
  projectId: string
  employeeId: string
  /** Verknüpfung zum Stempelsatz (Zuordnung auch wenn Arrays im Eintrag unvollständig sind) */
  timeEntryId?: string
  uploadTime: Date | any
  notes?: string
  imageComment?: string
  base64Data?: string
  mimeType?: string
}

/** Gespeicherte Abrechnung aus der Mitarbeiter-Zeitauswertung (Korrektur vs. Rohzeit). */
export interface TimeReportSettlement {
  id?: string
  employeeId: string
  periodStart: string
  periodEnd: string
  settledAt: Date | any
  /** Summe max(0, Rohzeit − korrigierte Zeit) in Minuten — als „abgerechnet“ / ausbezahlt betrachtet. */
  paidOutMinutes: number
  rawTotalMinutes: number
  correctedTotalMinutes: number
  lines?: Array<{
    timeEntryId: string
    dateLabel: string
    rawMinutes: number
    correctedMinutes: number
    paidOutMinutes: number
  }>
}

export interface LeaveRequest {
  id?: string
  employeeId: string
  employeeName?: string
  startDate: Date | any
  endDate: Date | any
  type: 'vacation' | 'sick' | 'special' | 'unpaid'
  reason?: string
  workingDays: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt?: Date | any
  updatedAt?: Date | any
  approvedBy?: string
  approvedAt?: Date | any
  rejectionReason?: string
}

