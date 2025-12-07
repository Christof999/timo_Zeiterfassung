import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from './firebaseConfig'
import type { Employee, Project, TimeEntry, Vehicle, VehicleUsage, FileUpload } from '../types'

class DataServiceClass {
  private authReadyPromise: Promise<void>

  constructor() {
    this.authReadyPromise = this.initAuth()
  }

  private initAuth(): Promise<void> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('✅ Firebase Auth bereit:', user.uid)
          resolve()
          unsubscribe()
        } else {
          console.log('Kein Benutzer, starte anonyme Anmeldung...')
          signInAnonymously(auth).catch((error) => {
            console.error('❌ Fehler bei der anonymen Anmeldung:', error)
            resolve() // Trotzdem auflösen, damit die App weiterläuft
          })
        }
      })
    })
  }

  // DataService initialisiert sich automatisch beim Instanziieren

  get authReady() {
    return this.authReadyPromise
  }

  // Employee Management
  async getCurrentUser(): Promise<Employee | null> {
    try {
      const savedUser = localStorage.getItem('lauffer_current_user')
      return savedUser ? JSON.parse(savedUser) : null
    } catch (error) {
      console.error('Fehler beim Laden des Benutzers:', error)
      return null
    }
  }

  setCurrentUser(user: Employee | null) {
    if (user) {
      const { password, ...safeUserData } = user
      localStorage.setItem('lauffer_current_user', JSON.stringify(safeUserData))
    } else {
      localStorage.removeItem('lauffer_current_user')
    }
  }

  clearCurrentUser() {
    localStorage.removeItem('lauffer_current_user')
  }

  async authenticateEmployee(username: string, password: string): Promise<Employee | null> {
    await this.authReadyPromise
    try {
      const employeesRef = collection(db, 'employees')
      const q = query(employeesRef, where('username', '==', username), limit(1))
      const snapshot = await getDocs(q)
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0]
        const employee = { id: doc.id, ...doc.data() } as Employee
        
        if (employee.password === password && employee.status === 'active') {
          const { password, ...employeeData } = employee
          return employeeData as Employee
        }
      }
      return null
    } catch (error) {
      console.error('Fehler bei der Authentifizierung:', error)
      return null
    }
  }

  // Project Management
  async getActiveProjects(): Promise<Project[]> {
    await this.authReadyPromise
    try {
      const projectsRef = collection(db, 'projects')
      const snapshot = await getDocs(projectsRef)
      let projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))
      
      projects = projects.filter(
        (project) =>
          !project.isActive || project.isActive === true ||
          !project.status || project.status === 'active' || project.status === 'aktiv'
      )
      
      projects.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      return projects
    } catch (error) {
      console.error('Fehler beim Abrufen aktiver Projekte:', error)
      return []
    }
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    await this.authReadyPromise
    if (!projectId) {
      return null
    }
    
    try {
      const projectRef = doc(db, 'projects', projectId)
      const projectDoc = await getDoc(projectRef)
      
      if (projectDoc.exists()) {
        return { id: projectDoc.id, ...projectDoc.data() } as Project
      }
      return null
    } catch (error) {
      console.error(`Fehler beim Abrufen des Projekts ${projectId}:`, error)
      return null
    }
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
        where('clockOutTime', '==', null),
        limit(1)
      )
      
      const snapshot = await getDocs(q)
      if (!snapshot.empty) {
        const doc = snapshot.docs[0]
        return { id: doc.id, ...doc.data() } as TimeEntry
      }
      return null
    } catch (error) {
      console.error('Fehler beim Abrufen des aktuellen Zeiteintrags:', error)
      return null
    }
  }

  async getTimeEntriesByEmployeeId(employeeId: string): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(timeEntriesRef, where('employeeId', '==', employeeId))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeEntry))
    } catch (error) {
      console.error('Fehler beim Abrufen der Zeiteinträge:', error)
      return []
    }
  }

  async addTimeEntry(timeEntryData: Partial<TimeEntry>): Promise<TimeEntry> {
    await this.authReadyPromise
    try {
      // Validierung: Prüfe auf doppelte Einstempelung
      const existingEntry = await this.getCurrentTimeEntry(timeEntryData.employeeId!)
      if (existingEntry) {
        throw new Error('Sie sind bereits eingestempelt. Bitte stempeln Sie zuerst aus.')
      }

      const timeEntriesRef = collection(db, 'timeEntries')
      const entryData = {
        ...timeEntryData,
        clockInTime: timeEntryData.clockInTime 
          ? (timeEntryData.clockInTime instanceof Date 
              ? Timestamp.fromDate(timeEntryData.clockInTime)
              : timeEntryData.clockInTime)
          : serverTimestamp(),
        clockOutTime: null
      }

      const docRef = await addDoc(timeEntriesRef, entryData)
      await updateDoc(docRef, { entryId: docRef.id })
      
      const newEntry = await getDoc(docRef)
      return { id: docRef.id, ...newEntry.data() } as TimeEntry
    } catch (error) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error)
      throw error
    }
  }

  async clockOutEmployee(
    timeEntryId: string, 
    notes: string, 
    location: { lat: number | null; lng: number | null } | null
  ): Promise<{ automaticBreak?: { duration: number; reason: string } }> {
    await this.authReadyPromise
    try {
      if (!timeEntryId) {
        throw new Error('Keine gültige Zeiteintrag-ID angegeben')
      }

      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      const timeEntryDoc = await getDoc(timeEntryRef)
      
      if (!timeEntryDoc.exists()) {
        throw new Error('Zeiteintrag nicht gefunden')
      }

      const timeEntry = timeEntryDoc.data() as TimeEntry
      if (timeEntry.clockOutTime !== null) {
        throw new Error('Dieser Mitarbeiter ist bereits ausgestempelt')
      }

      const clockOutTime = Timestamp.now()
      const clockInTime = timeEntry.clockInTime instanceof Timestamp 
        ? timeEntry.clockInTime.toDate()
        : new Date(timeEntry.clockInTime)

      // Automatische Pausenberechnung nach deutschem Arbeitszeitgesetz
      const workDurationMs = clockOutTime.toDate().getTime() - clockInTime.getTime()
      const workDurationHours = workDurationMs / (1000 * 60 * 60)
      
      let pauseTotalTime = 0
      let automaticBreak = undefined

      if (workDurationHours > 6) {
        // Bei mehr als 6 Stunden: 30 Minuten Pause
        pauseTotalTime = 30 * 60 * 1000
        automaticBreak = { duration: 30, reason: 'Arbeitszeit über 6 Stunden' }
      } else if (workDurationHours > 9) {
        // Bei mehr als 9 Stunden: 45 Minuten Pause
        pauseTotalTime = 45 * 60 * 1000
        automaticBreak = { duration: 45, reason: 'Arbeitszeit über 9 Stunden' }
      }

      const updateData: any = {
        clockOutTime,
        notes: notes || timeEntry.notes || '',
        pauseTotalTime
      }

      if (location) {
        updateData.clockOutLocation = location
        updateData.locationOut = location
      }

      await updateDoc(timeEntryRef, updateData)

      return { automaticBreak }
    } catch (error) {
      console.error('Fehler beim Ausstempeln:', error)
      throw error
    }
  }

  async updateTimeEntry(timeEntryId: string, updateData: Partial<TimeEntry>): Promise<void> {
    await this.authReadyPromise
    try {
      const timeEntryRef = doc(db, 'timeEntries', timeEntryId)
      await updateDoc(timeEntryRef, updateData)
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Zeiteintrags:', error)
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

  // File Upload
  async uploadFile(
    file: File,
    projectId: string,
    employeeId: string,
    type: string = 'construction_site',
    notes: string = '',
    comment: string = ''
  ): Promise<FileUpload> {
    await this.authReadyPromise
    try {
      // Komprimiere Bild
      const compressedFile = await this.compressImage(file, 0.5, 600)
      
      // Konvertiere zu Base64
      const base64DataUrl = await this.fileToBase64(compressedFile)
      const base64String = base64DataUrl.split(',')[1]
      const mimeType = base64DataUrl.split(',')[0].split(':')[1].split(';')[0]

      // Speichere in Firestore
      const fileUploadsRef = collection(db, 'fileUploads')
      const uploadData = {
        fileName: file.name,
        fileType: type,
        projectId,
        employeeId,
        base64Data: base64String,
        mimeType,
        notes,
        imageComment: comment,
        uploadTime: serverTimestamp()
      }

      const docRef = await addDoc(fileUploadsRef, uploadData)
      const uploadDoc = await getDoc(docRef)
      
      return {
        id: docRef.id,
        fileName: file.name,
        filePath: '', // Wird nicht verwendet bei Base64
        fileType: type,
        projectId,
        employeeId,
        uploadTime: uploadDoc.data()?.uploadTime || new Date(),
        notes,
        imageComment: comment
      } as FileUpload
    } catch (error) {
      console.error('Fehler beim Hochladen der Datei:', error)
      throw error
    }
  }

  private async compressImage(file: File, quality: number, maxWidth: number): Promise<File> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, { type: file.type }))
              } else {
                resolve(file)
              }
            },
            file.type,
            quality
          )
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
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

      const existingLiveDoc = timeEntryDoc.data().liveDocumentation || []
      const newDocumentation = {
        ...documentationData,
        timestamp: serverTimestamp()
      }

      await updateDoc(timeEntryRef, {
        liveDocumentation: [...existingLiveDoc, newDocumentation]
      })
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Live-Dokumentation:', error)
      throw error
    }
  }

  // Vehicle Management
  async getAllVehicles(): Promise<Vehicle[]> {
    await this.authReadyPromise
    try {
      const vehiclesRef = collection(db, 'vehicles')
      const snapshot = await getDocs(vehiclesRef)
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle))
    } catch (error) {
      console.error('Fehler beim Abrufen der Fahrzeuge:', error)
      return []
    }
  }

  async createVehicle(vehicleData: Partial<Vehicle>): Promise<string> {
    await this.authReadyPromise
    try {
      const vehiclesRef = collection(db, 'vehicles')
      const docRef = await addDoc(vehiclesRef, {
        ...vehicleData,
        createdAt: new Date()
      })
      return docRef.id
    } catch (error) {
      console.error('Fehler beim Erstellen des Fahrzeugs:', error)
      throw error
    }
  }

  async updateVehicle(id: string, vehicleData: Partial<Vehicle>): Promise<void> {
    await this.authReadyPromise
    try {
      const vehicleRef = doc(db, 'vehicles', id)
      await updateDoc(vehicleRef, {
        ...vehicleData,
        updatedAt: new Date()
      })
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Fahrzeugs:', error)
      throw error
    }
  }

  async getVehicleUsagesByProject(projectId: string): Promise<VehicleUsage[]> {
    await this.authReadyPromise
    try {
      const vehicleUsagesRef = collection(db, 'vehicleUsages')
      const q = query(vehicleUsagesRef, where('projectId', '==', projectId))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VehicleUsage))
    } catch (error) {
      console.error('Fehler beim Abrufen der Fahrzeugnutzungen:', error)
      return []
    }
  }

  async addVehicleUsage(usageData: Partial<VehicleUsage>): Promise<VehicleUsage> {
    await this.authReadyPromise
    try {
      const vehicleUsagesRef = collection(db, 'vehicleUsages')
      const docRef = await addDoc(vehicleUsagesRef, usageData)
      const usageDoc = await getDoc(docRef)
      
      return { id: docRef.id, ...usageDoc.data() } as VehicleUsage
    } catch (error) {
      console.error('Fehler beim Erstellen der Fahrzeugnutzung:', error)
      throw error
    }
  }

  // Admin Management
  async getCurrentAdmin(): Promise<any | null> {
    try {
      let savedAdmin = localStorage.getItem('lauffer_admin_user')
      if (!savedAdmin) {
        savedAdmin = localStorage.getItem('lauffer_current_admin')
      }
      return savedAdmin ? JSON.parse(savedAdmin) : null
    } catch (error) {
      console.error('Fehler beim Laden des Admins:', error)
      return null
    }
  }

  setCurrentAdmin(admin: any | null) {
    if (admin) {
      localStorage.setItem('lauffer_admin_user', JSON.stringify(admin))
      localStorage.setItem('lauffer_current_admin', JSON.stringify(admin))
    } else {
      localStorage.removeItem('lauffer_admin_user')
      localStorage.removeItem('lauffer_current_admin')
    }
  }

  clearCurrentAdmin() {
    localStorage.removeItem('lauffer_admin_user')
    localStorage.removeItem('lauffer_current_admin')
  }

  async authenticateAdmin(username: string, password: string): Promise<any | null> {
    await this.authReadyPromise
    try {
      // Einfache Admin-Authentifizierung (wie in der alten Version)
      if (username === 'admin' && password === 'admin123') {
        const admin = { username: 'admin', name: 'Administrator', isAdmin: true }
        this.setCurrentAdmin(admin)
        return admin
      }
      
      // Prüfe auch ob es ein Admin-Mitarbeiter ist
      const employeesRef = collection(db, 'employees')
      const q = query(employeesRef, where('username', '==', username), limit(1))
      const snapshot = await getDocs(q)
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0]
        const employee = { id: doc.id, ...doc.data() } as Employee
        
        if (employee.password === password && employee.isAdmin === true) {
          const admin = { 
            id: employee.id,
            username: employee.username, 
            name: employee.name || `${employee.firstName} ${employee.lastName}`,
            isAdmin: true 
          }
          this.setCurrentAdmin(admin)
          return admin
        }
      }
      
      return null
    } catch (error) {
      console.error('Fehler bei der Admin-Authentifizierung:', error)
      return null
    }
  }

  // Admin: Alle Mitarbeiter abrufen
  async getAllEmployees(): Promise<Employee[]> {
    await this.authReadyPromise
    try {
      const employeesRef = collection(db, 'employees')
      const snapshot = await getDocs(employeesRef)
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Employee))
    } catch (error) {
      console.error('Fehler beim Abrufen aller Mitarbeiter:', error)
      return []
    }
  }

  async getAllActiveEmployees(): Promise<Employee[]> {
    await this.authReadyPromise
    try {
      const employeesRef = collection(db, 'employees')
      const snapshot = await getDocs(employeesRef)
      const allEmployees = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Employee))
      
      return allEmployees.filter(employee => 
        employee.status !== 'inactive' && 
        employee.name !== 'Administrator'
      )
    } catch (error) {
      console.error('Fehler beim Abrufen der aktiven Mitarbeiter:', error)
      return []
    }
  }

  async createEmployee(employeeData: Partial<Employee>): Promise<string> {
    await this.authReadyPromise
    try {
      // Prüfe auf doppelten Benutzernamen
      const employeesRef = collection(db, 'employees')
      const q = query(employeesRef, where('username', '==', employeeData.username), limit(1))
      const existingSnapshot = await getDocs(q)
      
      if (!existingSnapshot.empty) {
        throw new Error('Dieser Benutzername ist bereits vergeben.')
      }

      // Standard-Urlaubsdaten hinzufügen
      if (!employeeData.vacationDays) {
        employeeData.vacationDays = {
          total: 30,
          used: 0,
          year: new Date().getFullYear()
        }
      }

      const docRef = await addDoc(employeesRef, employeeData)
      return docRef.id
    } catch (error) {
      console.error('Fehler beim Erstellen des Mitarbeiters:', error)
      throw error
    }
  }

  async updateEmployee(id: string, employeeData: Partial<Employee>): Promise<void> {
    await this.authReadyPromise
    try {
      if (!id) {
        throw new Error('Keine gültige Mitarbeiter-ID angegeben')
      }

      // Prüfe auf doppelten Benutzernamen (außer dem aktuellen)
      if (employeeData.username) {
        const employeesRef = collection(db, 'employees')
        const q = query(employeesRef, where('username', '==', employeeData.username), limit(1))
        const existingSnapshot = await getDocs(q)
        
        if (!existingSnapshot.empty && existingSnapshot.docs[0].id !== id) {
          throw new Error('Dieser Benutzername ist bereits vergeben.')
        }
      }

      const employeeRef = doc(db, 'employees', id)
      await updateDoc(employeeRef, employeeData)
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Mitarbeiters ${id}:`, error)
      throw error
    }
  }

  async deleteEmployee(id: string): Promise<void> {
    await this.authReadyPromise
    try {
      // Prüfe auf aktive Zeiteinträge
      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(
        timeEntriesRef,
        where('employeeId', '==', id),
        where('clockOutTime', '==', null),
        limit(1)
      )
      const activeEntries = await getDocs(q)
      
      if (!activeEntries.empty) {
        throw new Error('Dieser Mitarbeiter hat noch aktive Zeiteinträge und kann nicht gelöscht werden.')
      }

      const employeeRef = doc(db, 'employees', id)
      await updateDoc(employeeRef, { status: 'inactive' })
    } catch (error) {
      console.error(`Fehler beim Löschen des Mitarbeiters ${id}:`, error)
      throw error
    }
  }

  // Admin: Alle Projekte abrufen
  async getAllProjects(): Promise<Project[]> {
    await this.authReadyPromise
    try {
      const projectsRef = collection(db, 'projects')
      const snapshot = await getDocs(projectsRef)
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))
    } catch (error) {
      console.error('Fehler beim Abrufen aller Projekte:', error)
      return []
    }
  }

  async createProject(projectData: Partial<Project>): Promise<string> {
    await this.authReadyPromise
    try {
      const projectsRef = collection(db, 'projects')
      const docRef = await addDoc(projectsRef, {
        ...projectData,
        isActive: projectData.isActive !== false,
        status: projectData.status || 'active'
      })
      return docRef.id
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error)
      throw error
    }
  }

  async updateProject(id: string, projectData: Partial<Project>): Promise<void> {
    await this.authReadyPromise
    try {
      if (!id) {
        throw new Error('Keine gültige Projekt-ID angegeben')
      }

      const projectRef = doc(db, 'projects', id)
      await updateDoc(projectRef, projectData)
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Projekts ${id}:`, error)
      throw error
    }
  }

  async deleteProject(id: string): Promise<void> {
    await this.authReadyPromise
    try {
      const projectRef = doc(db, 'projects', id)
      await updateDoc(projectRef, { 
        status: 'archived',
        isActive: false 
      })
    } catch (error) {
      console.error(`Fehler beim Löschen des Projekts ${id}:`, error)
      throw error
    }
  }

  // Admin: Dashboard-Daten
  async getCurrentTimeEntries(): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(timeEntriesRef, where('clockOutTime', '==', null))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeEntry))
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
      
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeEntry))
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
        
        const diffMs = clockOut.getTime() - clockIn.getTime()
        const pauseTotalTime = entry.pauseTotalTime || 0
        const actualWorkTime = diffMs - pauseTotalTime
        const hours = actualWorkTime / (1000 * 60 * 60)
        totalHours += hours
      }
    })
    
    return totalHours
  }

  async getTimeEntriesByProject(projectId: string): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const timeEntriesRef = collection(db, 'timeEntries')
      const q = query(timeEntriesRef, where('projectId', '==', projectId))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeEntry))
    } catch (error) {
      console.error(`Fehler beim Abrufen der Zeiteinträge für Projekt ${projectId}:`, error)
      return []
    }
  }

  // Projekt-Dateien laden (wie in der alten App - aus Zeiteinträgen und zusätzlich direkt per projectId)
  async getProjectFiles(projectId: string, type: string = 'construction_site'): Promise<FileUpload[]> {
    await this.authReadyPromise
    try {
      if (!projectId) {
        console.error('Keine Projekt-ID angegeben')
        return []
      }

      const timeEntries = await this.getTimeEntriesByProject(projectId)
      if (!timeEntries || timeEntries.length === 0) {
        console.log('Keine Zeiteinträge für Projekt gefunden:', projectId)
      }

      let fileIds: string[] = []
      let directFiles: any[] = []

      timeEntries.forEach((entry) => {
        try {
          if (type === 'construction_site') {
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
          } else if (type === 'document' || type === 'delivery_note') {
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

      // Entferne Duplikate
      fileIds = [...new Set(fileIds)]

      // Lade Dateien aus fileUploads Collection basierend auf IDs
      const files: FileUpload[] = []
      
      if (fileIds.length > 0) {
        console.log(`Lade ${fileIds.length} Dateien für Projekt ${projectId}, Typ: ${type}`)
        // Lade Dateien einzeln (Firestore unterstützt keine IN-Queries mit vielen IDs)
        const promises = fileIds.map(async (fileId) => {
          try {
            if (!fileId || typeof fileId !== 'string') {
              console.warn('Ungültige Datei-ID:', fileId)
              return null
            }
            
            const fileRef = doc(db, 'fileUploads', fileId)
            const fileDoc = await getDoc(fileRef)
            if (fileDoc.exists()) {
              const data = fileDoc.data() as any
              const uploadTime = data.uploadTime instanceof Timestamp
                ? data.uploadTime.toDate()
                : (data.uploadTime instanceof Date 
                    ? data.uploadTime 
                    : data.uploadTime?.toDate?.() || new Date(data.uploadTime || Date.now()))
              
              return {
                id: fileDoc.id,
                fileName: data.fileName || '',
                filePath: data.filePath || '',
                fileType: data.fileType || type,
                projectId: data.projectId || projectId,
                employeeId: data.employeeId || '',
                uploadTime: uploadTime || new Date(),
                notes: data.notes || '',
                imageComment: data.imageComment || '',
                base64Data: data.base64Data,
                mimeType: data.mimeType
              } as FileUpload
            } else {
              console.warn(`Datei ${fileId} nicht gefunden in fileUploads`)
              return null
            }
          } catch (error) {
            console.error(`Fehler beim Laden der Datei ${fileId}:`, error)
            return null
          }
        })
        
        const loadedFiles = await Promise.all(promises)
        const validFiles = loadedFiles.filter(f => f !== null) as FileUpload[]
        files.push(...validFiles)
        console.log(`${validFiles.length} von ${fileIds.length} Dateien erfolgreich geladen`)
      }

      // Zusätzliche Dateien direkt über projectId (falls nicht in Zeiteinträgen referenziert)
      try {
        const uploadsByProject = await this.getFileUploads(projectId)
        console.log(`Zusätzliche Dateien direkt über projectId (${projectId}):`, uploadsByProject.length)
        uploadsByProject.forEach((u) => files.push(u))
      } catch (extraErr) {
        console.warn('Konnte zusätzliche Dateien über projectId nicht laden:', extraErr)
      }

      // Füge direkte Dateien hinzu
      directFiles.forEach((file) => {
        files.push({
          id: file.id || `direct-${Date.now()}-${Math.random()}`,
          fileName: file.fileName || file.name || 'Unbekannt',
          filePath: file.url || file.filePath || '',
          fileType: file.fileType || type,
          projectId: file.projectId || projectId,
          employeeId: file.employeeId || '',
          uploadTime: file.timestamp ? this.convertToDate(file.timestamp) : new Date(),
          notes: file.notes || file.comment || '',
          imageComment: file.imageComment || file.comment || '',
          base64Data: file.base64Data || file.base64,
          mimeType: file.mimeType || file.type || 'image/jpeg'
        } as FileUpload)
      })

      // Debug: Zeige alle Dateien VOR dem Filtern mit ALLEN Feldern
      console.log(`📋 Alle Dateien für Projekt ${projectId} VOR Filterung (${files.length}):`, files.map(f => ({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        mimeType: f.mimeType,
        hasBase64Data: !!f.base64Data,
        hasFilePath: !!f.filePath,
        hasData: !!(f as any).data,
        hasUrl: !!(f as any).url,
        allKeys: Object.keys(f)
      })))
      
      // Zeige die ersten 2 Fotos komplett
      const photoFiles = files.filter(f => {
        const fileName = (f.fileName || '').toLowerCase()
        return fileName.match(/\.(jpg|jpeg|png|gif)$/i)
      }).slice(0, 2)
      if (photoFiles.length > 0) {
        console.log(`🖼️ Beispiel-Foto-Objekte (erste 2):`, photoFiles)
      }

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

        if (type === 'construction_site') {
          // Prüfe verschiedene Kriterien für Fotos
          const isPhotoByType = fileType === 'construction_site' || fileType === 'site_photo' || fileType === 'photo' || fileType === 'baustellenfoto' || fileType === 'baustelle'
          const isPhotoByMime = mime.startsWith('image/') || fileType.startsWith('image/')
          const isPhotoByExtension = fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
          const isPhotoByBase64 = f.base64Data && (!mime || mime.startsWith('image/'))
          
          const isPhoto = isPhotoByType || isPhotoByMime || isPhotoByExtension || isPhotoByBase64
          console.log(`🔍 Prüfe Foto ${f.fileName}: fileType="${fileType}", mime="${mime}", fileName="${fileName}", isPhoto=${isPhoto} (byType=${isPhotoByType}, byMime=${isPhotoByMime}, byExt=${!!isPhotoByExtension}, byBase64=${isPhotoByBase64})`)
          return isPhoto
        }

        if (type === 'document' || type === 'delivery_note') {
          // Dokumente: alles was KEIN Bild ist
          const isImage = mime.startsWith('image/') || fileType.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
          const isDoc = fileType === 'document' || fileType === 'invoice' || fileType === 'delivery_note' || fileType === 'rechnung' || fileType === 'lieferschein' || fileType === 'dokument' || !isImage
          return isDoc
        }

        // Fallback: wenn Typ unbekannt, alles durchlassen
        return true
      })

      // Dedupliziere nach id (falls über Zeiteinträge + direct + projectId doppelt)
      const seenIds = new Set<string>()
      filteredFiles = filteredFiles.filter((f) => {
        const key = f.id || `${f.fileName}-${f.projectId}`
        if (seenIds.has(key)) return false
        seenIds.add(key)
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
  private convertToDate(timestamp: any): Date {
    if (!timestamp) return new Date()
    
    if (timestamp instanceof Date) {
      return timestamp
    }
    
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate()
    }
    
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate()
    }
    
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp)
    }
    
    if (timestamp.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000)
    }
    
    return new Date()
  }

  async getAllTimeEntries(): Promise<TimeEntry[]> {
    await this.authReadyPromise
    try {
      const timeEntriesRef = collection(db, 'timeEntries')
      const snapshot = await getDocs(timeEntriesRef)
      
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeEntry))
    } catch (error) {
      console.error('Fehler beim Abrufen aller Zeiteinträge:', error)
      return []
    }
  }

  async getFileUploads(projectId?: string, type?: string): Promise<FileUpload[]> {
    await this.authReadyPromise
    try {
      const fileUploadsRef = collection(db, 'fileUploads')
      let q: any = fileUploadsRef
      
      if (projectId) {
        q = query(fileUploadsRef, where('projectId', '==', projectId))
      }
      
      const snapshot = await getDocs(q)
      let uploads = snapshot.docs.map((doc, index) => {
        const data = doc.data() as any
        const uploadTime = data.uploadTime instanceof Timestamp
          ? data.uploadTime.toDate()
          : (data.uploadTime as Date | undefined)
        
        // Debug: Zeige die ersten 3 Firestore-Dokumente KOMPLETT als JSON
        if (index < 3) {
          // Finde Felder, die groß sind (könnten base64 sein)
          const largeFields = Object.keys(data).filter(key => {
            const val = data[key]
            return typeof val === 'string' && val.length > 1000
          })
          
          // Erstelle eine Kopie mit gekürzten großen Feldern für das Log
          const dataCopy = { ...data }
          largeFields.forEach(key => {
            dataCopy[key] = `[${data[key].length} Zeichen] ${data[key].substring(0, 50)}...`
          })
          
          console.log(`🔥 FIRESTORE DOC #${index} (${doc.id}) - ALLE KEYS: ${Object.keys(data).join(', ')}`)
          console.log(`🔥 FIRESTORE DOC #${index} (${doc.id}) - GROSSE FELDER: ${largeFields.length > 0 ? largeFields.join(', ') : 'KEINE!'}`)
          console.log(`🔥 FIRESTORE DOC #${index} (${doc.id}) - DATEN:`, JSON.stringify(dataCopy, null, 2))
        }
        
        // Suche nach base64-Daten in verschiedenen möglichen Feldern
        let base64 = data.base64Data || data.base64String || data.base64 || ''
        let fileUrl = data.url || data.filePath || ''
        
        // Falls url eine data URL ist, extrahiere base64 daraus
        if (fileUrl && fileUrl.startsWith('data:')) {
          const parts = fileUrl.split(',')
          if (parts.length > 1) {
            base64 = parts[1]
          }
        }
        
        // Falls mimeType ein data URL ist, könnte base64 direkt darin sein
        if (!base64 && data.mimeType && data.mimeType.includes(',')) {
          const parts = data.mimeType.split(',')
          if (parts.length > 1) {
            base64 = parts[1]
          }
        }
        
        return { 
          id: doc.id,
          fileName: data.fileName || data.name || '',
          filePath: fileUrl,
          fileType: data.fileType || data.type || data.contentType || '',
          projectId: data.projectId || '',
          employeeId: data.employeeId || '',
          uploadTime: uploadTime || new Date(),
          notes: data.notes || data.comment || '',
          imageComment: data.imageComment || data.comment || '',
          base64Data: base64,
          mimeType: data.mimeType || data.contentType || ''
        } as FileUpload
      })
      
      if (type) {
        uploads = uploads.filter(upload => upload.fileType === type)
      }
      
      return uploads
    } catch (error) {
      console.error('Fehler beim Abrufen der Datei-Uploads:', error)
      return []
    }
  }
}

export const DataService = new DataServiceClass()

