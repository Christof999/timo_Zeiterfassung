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
  type: 'projects' | 'customers' | 'materials' | 'health' | 'times'
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
  /** Interner Kostensatz (EUR/Std) – was der Mitarbeiter das Unternehmen kostet.
   *  Gegenstück zum Material-Einkaufspreis; nur Admin/Nachkalkulation. */
  hourlyCostRate?: number
  /** Lohnnebenkosten (EUR/Std) – frei befüllbares Stammdatenfeld, analog zum Stundenlohn. */
  ancillaryWageCosts?: number
  /** Auszubildender: wird nicht nach Stunden, sondern über einen Fixlohn vergütet. */
  isApprentice?: boolean
  /** Fixe monatliche Vergütung (EUR) – gilt nur für Auszubildende. */
  fixedMonthlySalary?: number
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
  /**
   * Umfang der Admin-Rechte. 'full' = kompletter Admin-Bereich,
   * 'payroll' = nur Zeiterfassungsbericht und Mitarbeiter (für die
   * Lohnabrechnung). Ohne Angabe gilt 'full'.
   */
  adminRole?: AdminRole
}

/** Rollen im Admin-Bereich. */
export type AdminRole = 'full' | 'payroll'

/** Größe einer Dashboard-Kachel (Spaltenbreite im Grid). */
export type DashboardWidgetSize = 'small' | 'medium' | 'large'

/** Eine im Admin-Dashboard platzierte Widget-Instanz (Reihenfolge = Array-Index). */
export interface DashboardWidgetInstance {
  /** Eindeutige Instanz-ID (ein Widget kann mehrfach vorkommen). */
  instanceId: string
  /** Schlüssel aus der Widget-Registry (dem „Pool"). */
  key: string
  size: DashboardWidgetSize
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
  /** Verknüpfter Kunde (customers.id) */
  customerId?: string
  /** Anzeigename des verknüpften Kunden (denormalisiert) */
  customerName?: string
  /** Aus dem HERO-Angebot importierte Soll-Positionen (Material + Lohn) */
  offerPositions?: OfferPosition[]
  offerMeta?: {
    nr?: string
    date?: string
    value?: number
    positionCount?: number
    materialCount?: number
    importedAt?: Date | any
  }
  /** HERO project_matches.id */
  heroProjectId?: string
  heroProjectNr?: string
  heroLastSyncedAt?: Date | any
  heroSyncSource?: 'hero'
  heroStatusCode?: number
  heroStatusName?: string
}

/** Eine Position aus dem HERO-Angebot (Soll) – Material oder Lohn */
export interface OfferPosition {
  /** HERO-Artikelnummer */
  nr?: string
  name: string
  /** Einheit, z. B. m², lfm, Std */
  unit?: string
  /** Soll-Menge aus dem Angebot */
  quantity?: number
  /** Netto-Stückpreis (nur für Admin/Nachkalkulation) */
  unitPriceEur?: number
  vatPercent?: number
  /** 'material' = für Mitarbeiter sichtbar; 'labor' = nur Admin (Lohn) */
  kind: 'material' | 'labor'
  /**
   * Herkunft der Position. 'manual' = im Projekt manuell ergänzt/angepasst;
   * bleibt beim HERO-Sync erhalten (gewinnt bei Namensgleichheit gegen HERO).
   * Sonst aus dem HERO-Angebot übernommen.
   */
  source?: 'hero' | 'manual'
}

/** Kunde – manuell angelegt oder aus HERO synchronisiert */
export interface Customer {
  id: string
  /** Anzeigename (Firma oder Vor-/Nachname) */
  name: string
  companyName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  isActive?: boolean
  /** 'hero' = aus HERO importiert, sonst manuell angelegt */
  source?: 'hero' | 'manual'
  /** HERO customer.id (für Sync/Abgleich) */
  heroCustomerId?: string
  heroLastSyncedAt?: Date | any
  createdAt?: Date | any
  updatedAt?: Date | any
}

/** Verbrauchsmaterial beim Ausstempeln (Stückliste für Nachkalkulation) */
export interface TimeEntryMaterialUsage {
  materialTypeId: string
  materialName?: string
  unitLabel?: string
  quantity: number
  unitPriceEur?: number
}

/**
 * Material-Gutschrift: am Projektende zu viel geliefertes Material, das wieder
 * gutgeschrieben wird. Gegenstück zum Verbrauch (TimeEntryMaterialUsage).
 */
export interface MaterialCredit {
  id: string
  projectId: string
  /** Art der Buchung: Gutschrift (Standard) oder nachgetragener Verbrauch. */
  kind?: 'credit' | 'consumption'
  /** Wer die Buchung erfasst hat (Mitarbeiter oder Admin) */
  employeeId?: string
  employeeName?: string
  /** Optionaler Bezug zum Material-Katalog */
  materialTypeId?: string
  materialName: string
  /** z. B. m², Stück, Sack */
  unitLabel?: string
  quantity: number
  unitPriceEur?: number
  note?: string
  createdAt: Date | any
}

export interface MaterialType {
  id: string
  name: string
  /** z. B. m², Stück, Sack */
  unitLabel?: string
  /** Verkaufspreis pro Mengeneinheit (EUR) */
  unitPriceEur?: number
  /** Einkaufspreis pro Mengeneinheit (EUR) – nur Admin/Nachkalkulation, nicht in der Mitarbeiter-Auswahl */
  purchasePriceEur?: number
  isActive?: boolean
  sortOrder?: number
  /** 'hero' = aus HERO-Artikel importiert, sonst manuell */
  source?: 'hero' | 'manual'
  /** HERO supply_product_versions.product_id (für Abgleich) */
  heroArticleId?: string
  heroLastSyncedAt?: Date | any
}

export interface TimeEntry {
  id: string
  employeeId: string
  /** Projekt-ID; bei Kleinaufträgen direkt am Kunden leer */
  projectId: string
  /** Direkt-Buchung auf einen Kunden (Kleinauftrag ohne Projekt) */
  customerId?: string
  /** Anzeigename des Kunden bei Direkt-Buchung (denormalisiert) */
  customerName?: string
  clockInTime: Date | any
  clockOutTime?: Date | any | null
  clockInLocation?: { lat: number | null; lng: number | null } | null
  clockOutLocation?: { lat: number | null; lng: number | null } | null
  locationOut?: { lat: number | null; lng: number | null } | null
  notes?: string
  /** Beim Ausstempeln erfasstes Material (qm, Stück, …) */
  materialUsages?: TimeEntryMaterialUsage[]
  /** Beim Ausstempeln gutgeschriebenes (zu viel geliefertes) Material */
  materialCreditUsages?: TimeEntryMaterialUsage[]
  pauseTotalTime?: number
  /** Entfernung Firmenstandort → Standort des Mitarbeiters beim Ausstempeln (km, Luftlinie/Radius) */
  returnTravelDistanceKm?: number
  /** Gutgeschriebene Fahrtzeit laut Entfernungs-Staffel beim Ausstempeln (Minuten) */
  returnTravelMinutes?: number
  /** Der gebuchten Arbeitszeit gutgeschriebene Fahrtzeit (Millisekunden) */
  returnTravelCreditMs?: number
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
    /** Legacy: volle Objekte — nicht mehr beim Speichern befüllen */
    images?: any[]
    documents?: any[]
    imageIds?: string[]
    documentIds?: string[]
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
  /** Admin-Korrektur aus dem Zeiterfassungsbericht (Audit-Trail) */
  adminCorrectedAt?: Date | any
  adminCorrectedBy?: string
  adminCorrectedByName?: string
  /** Herkunft, wenn ein Kleinauftrag nachträglich auf ein Projekt umgebucht wurde */
  movedFromCustomerId?: string | null
  movedFromCustomerName?: string | null
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
  /** Pfad in Firebase Storage (neue Uploads) */
  storagePath?: string
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

/**
 * Überstunden, die der Mitarbeiter selbst für einen Kalendermonat zur
 * Verrechnung angemeldet hat. Die Minuten sind bereits vom Überstundenkonto
 * abgezogen – auch dann, wenn der Monat noch läuft.
 */
export interface OvertimeSettlement {
  id?: string
  employeeId: string
  /** Abrechnungsmonat als "YYYY-MM" */
  month: string
  /** Im Monat verrechnete Überstunden in Minuten */
  minutes: number
  createdAt?: Date | any
  updatedAt?: Date | any
}

export interface LeaveRequest {
  id?: string
  employeeId: string
  employeeName?: string
  startDate: Date | any
  endDate: Date | any
  /** 'overtime' = Urlaub auf Überstunden (wird vom Überstundenkonto abgezogen) */
  type: 'vacation' | 'sick' | 'special' | 'unpaid' | 'overtime'
  reason?: string
  workingDays: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt?: Date | any
  updatedAt?: Date | any
  approvedBy?: string
  approvedAt?: Date | any
  /** Einzelne Urlaubstage, die z. B. durch tatsaechliches Stempeln wieder gutgeschrieben wurden. */
  cancelledDates?: string[]
  autoCancelledAt?: Date | any
  autoCancellationReason?: string
  autoCancelledByTimeEntryId?: string
  rejectionReason?: string
}

