import { DataService } from './dataService'

/**
 * Offline-Upload-Queue für Baustellen-Dokumentation.
 *
 * Auf der Baustelle ist das Netz oft instabil oder kurz weg. Statt den Speichern-Vorgang
 * mit einem Fehler abzubrechen (und die Fotos zu verlieren), werden die Fotos hier lokal in
 * IndexedDB zwischengespeichert und automatisch hochgeladen, sobald wieder Netz da ist —
 * auch nach App-Neustart, da IndexedDB persistent ist (inkl. der Foto-Blobs).
 */

const DB_NAME = 'zeiterfassung-offline'
const DB_VERSION = 1
const STORE = 'pendingDocJobs'
const RETRY_INTERVAL_MS = 30_000

export interface PendingPhoto {
  blob: Blob
  fileName: string
  fileType: string
  comment: string
}

export interface PendingDocJob {
  id: string
  createdAt: number
  timeEntryId: string
  projectId: string
  employeeId: string
  /** Wird nur angewendet, falls die Notizen online noch nicht gespeichert werden konnten. */
  notes?: string
  notesApplied?: boolean
  sitePhotos: PendingPhoto[]
  documentPhotos: PendingPhoto[]
  attempts: number
  lastError?: string
}

export interface OfflineQueueState {
  pendingJobs: number
  pendingPhotos: number
  processing: boolean
}

type Listener = (state: OfflineQueueState) => void

function countPhotos(jobs: PendingDocJob[]): number {
  return jobs.reduce((sum, j) => sum + j.sitePhotos.length + j.documentPhotos.length, 0)
}

class OfflineUploadQueue {
  private dbPromise: Promise<IDBDatabase> | null = null
  private listeners = new Set<Listener>()
  private processing = false
  private initialized = false
  private lastState: OfflineQueueState = { pendingJobs: 0, pendingPhotos: 0, processing: false }

  /** Einmalig beim App-Start aufrufen: Listener registrieren und ggf. Queue abarbeiten. */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true

    window.addEventListener('online', () => void this.processQueue())
    window.addEventListener('focus', () => void this.processQueue())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.processQueue()
    })
    window.setInterval(() => void this.processQueue(), RETRY_INTERVAL_MS)

    // Aktuellen Stand laden und einen ersten Abarbeitungsversuch starten
    void this.refreshState().then(() => this.processQueue())
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.lastState)
    return () => this.listeners.delete(listener)
  }

  getState(): OfflineQueueState {
    return this.lastState
  }

  /** Fotos zur späteren Übertragung einreihen. Gibt die Job-ID zurück. */
  async enqueue(input: {
    timeEntryId: string
    projectId: string
    employeeId: string
    notes?: string
    sitePhotos: PendingPhoto[]
    documentPhotos: PendingPhoto[]
  }): Promise<string> {
    const job: PendingDocJob = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      timeEntryId: input.timeEntryId,
      projectId: input.projectId,
      employeeId: input.employeeId,
      notes: input.notes,
      notesApplied: false,
      sitePhotos: input.sitePhotos,
      documentPhotos: input.documentPhotos,
      attempts: 0
    }
    await this.put(job)
    await this.refreshState()
    // Sofort versuchen (falls doch Netz da ist), sonst greifen die Listener/Intervalle
    void this.processQueue()
    return job.id
  }

  async processQueue(): Promise<void> {
    if (this.processing) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    const jobs = await this.getAllJobs()
    if (jobs.length === 0) return

    this.processing = true
    this.lastState = { ...this.lastState, processing: true }
    this.emit()
    try {
      for (const job of jobs) {
        try {
          await this.processJob(job)
        } catch (err) {
          job.attempts = (job.attempts || 0) + 1
          job.lastError = err instanceof Error ? err.message : String(err)
          await this.put(job)
          // Sieht nach Netzproblem aus → später erneut, restliche Jobs jetzt nicht weiter quälen
          if (this.isNetworkLikeError(err)) break
        }
      }
    } finally {
      this.processing = false
      await this.refreshState()
    }
  }

  /** Lädt alle Fotos eines Jobs einzeln hoch und verknüpft sie sofort — robust gegen Abbrüche. */
  private async processJob(job: PendingDocJob): Promise<void> {
    while (job.sitePhotos.length > 0) {
      const photo = job.sitePhotos[0]
      const upload = await this.uploadPhoto(job, photo)
      await DataService.attachDocumentationUploads(job.timeEntryId, {
        sitePhotos: [upload],
        notes: job.notesApplied ? undefined : job.notes
      })
      job.notesApplied = true
      job.sitePhotos.shift()
      await this.put(job)
      await this.refreshState()
    }

    while (job.documentPhotos.length > 0) {
      const photo = job.documentPhotos[0]
      const upload = await this.uploadPhoto(job, photo)
      await DataService.attachDocumentationUploads(job.timeEntryId, {
        documents: [upload],
        notes: job.notesApplied ? undefined : job.notes
      })
      job.notesApplied = true
      job.documentPhotos.shift()
      await this.put(job)
      await this.refreshState()
    }

    if (!job.notesApplied && job.notes && job.notes.trim()) {
      await DataService.attachDocumentationUploads(job.timeEntryId, { notes: job.notes })
      job.notesApplied = true
    }

    await this.delete(job.id)
  }

  private uploadPhoto(job: PendingDocJob, photo: PendingPhoto) {
    const file = new File([photo.blob], photo.fileName || 'foto.jpg', {
      type: photo.blob.type || 'image/jpeg'
    })
    return DataService.uploadFile(
      file,
      job.projectId,
      job.employeeId,
      photo.fileType,
      '',
      photo.comment || '',
      { timeEntryId: job.timeEntryId }
    )
  }

  private isNetworkLikeError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
    return /network|netzwerk|unavailable|deadline|timeout|zeitüber|offline|failed to fetch|fetch|storage|retry|schlechtes netz/.test(
      msg
    )
  }

  // ---- State / Benachrichtigung ------------------------------------------------

  private emit(): void {
    for (const l of this.listeners) l(this.lastState)
  }

  private async refreshState(): Promise<void> {
    const jobs = await this.getAllJobs().catch(() => [] as PendingDocJob[])
    this.lastState = {
      pendingJobs: jobs.length,
      pendingPhotos: countPhotos(jobs),
      processing: this.processing
    }
    this.emit()
  }

  // ---- IndexedDB ---------------------------------------------------------------

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.dbPromise
  }

  private async getAllJobs(): Promise<PendingDocJob[]> {
    const db = await this.openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const jobs = (req.result as PendingDocJob[]) || []
        jobs.sort((a, b) => a.createdAt - b.createdAt)
        resolve(jobs)
      }
      req.onerror = () => reject(req.error)
    })
  }

  private async put(job: PendingDocJob): Promise<void> {
    const db = await this.openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(job)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async delete(id: string): Promise<void> {
    const db = await this.openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

export const offlineUploadQueue = new OfflineUploadQueue()
