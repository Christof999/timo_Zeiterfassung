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
  vacationDays?: {
    total: number
    used: number
    year: number
  }
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
  employeeId: string
  projectId: string
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
  uploadTime: Date | any
  notes?: string
  imageComment?: string
  base64Data?: string
  mimeType?: string
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

