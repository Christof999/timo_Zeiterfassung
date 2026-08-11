import React, { useMemo, useState } from 'react'
import { DataService } from '../services/dataService'
import type { Employee } from '../types'
import { toast } from './ToastContainer'
import { getBavariaHolidayName } from '../utils/bavariaHolidays'
import '../styles/Modal.css'

/** Projekt-Kennung für Uploads ohne Baustellenbezug (AU-Bescheinigungen). */
const ABSENCE_UPLOAD_PROJECT = '_absence'

/** Dateityp des Uploads – trennt AU-Nachweise von Baustellenfotos. */
const SICK_NOTE_FILE_TYPE = 'sick_note'

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function employeeLabel(e: Employee): string {
  const parts = `${e.firstName || ''} ${e.lastName || ''}`.trim()
  return (e.name?.trim() || parts || e.username || '').trim()
}

/** Werktage ohne Wochenende und bayerische Feiertage im Zeitraum. */
function countWorkingDays(start: Date, end: Date): number {
  const current = new Date(start)
  current.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)

  let days = 0
  while (current <= last) {
    const day = current.getDay()
    if (day !== 0 && day !== 6 && !getBavariaHolidayName(current)) days++
    current.setDate(current.getDate() + 1)
  }
  return days
}

interface SickLeaveModalProps {
  employee: Employee
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Krankmeldung durch den Mitarbeiter.
 *
 * Zeitraum angeben und ein Bild der Arbeitsunfähigkeitsbescheinigung hochladen.
 * Das Bild ist Pflicht: ohne Nachweis wird nichts gespeichert. Der Eintrag geht
 * direkt als genehmigt in die Abwesenheiten (kein Urlaubsantrag) und ist für den
 * Admin auf der Mitarbeiterkarte samt Bild einsehbar.
 */
const SickLeaveModal: React.FC<SickLeaveModalProps> = ({ employee, onClose, onSuccess }) => {
  const today = useMemo(() => toDateInputValue(new Date()), [])
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [progress, setProgress] = useState('')

  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return 0
    const start = new Date(`${startDate}T12:00:00`)
    const end = new Date(`${endDate}T12:00:00`)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0
    return countWorkingDays(start, end)
  }, [startDate, endDate])

  const handleFileSelect = (files: FileList | null) => {
    const selected = files?.[0]
    if (!selected) return

    // Nur Bilder und PDFs – die AU kommt in der Regel als Foto vom Handy
    const isImage = selected.type.startsWith('image/')
    const isPdf = selected.type === 'application/pdf'
    if (!isImage && !isPdf) {
      toast.error('Bitte ein Foto oder ein PDF der AU auswählen.')
      return
    }

    setFile(selected)
    if (isImage) {
      const reader = new FileReader()
      reader.onload = (event) => setPreview((event.target?.result as string) || '')
      reader.readAsDataURL(selected)
    } else {
      setPreview('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!employee.id) {
      toast.error('Mitarbeiter konnte nicht ermittelt werden.')
      return
    }

    const start = new Date(`${startDate}T12:00:00`)
    const end = new Date(`${endDate}T12:00:00`)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      toast.error('Bitte einen gültigen Zeitraum angeben.')
      return
    }
    if (end < start) {
      toast.error('Das Enddatum darf nicht vor dem Startdatum liegen.')
      return
    }
    if (workingDays === 0) {
      toast.error('Im gewählten Zeitraum liegt kein Arbeitstag (Wochenenden und Feiertage zählen nicht).')
      return
    }
    if (!file) {
      toast.error('Bitte ein Bild der Arbeitsunfähigkeitsbescheinigung hochladen.')
      return
    }

    setIsSaving(true)
    try {
      setProgress('Nachweis wird hochgeladen…')
      const upload = await DataService.uploadFile(
        file,
        ABSENCE_UPLOAD_PROJECT,
        employee.id,
        SICK_NOTE_FILE_TYPE,
        `Krankmeldung ${startDate} bis ${endDate}`,
        note.trim(),
        { onProgress: (msg) => setProgress(msg) }
      )

      setProgress('Krankmeldung wird gespeichert…')
      await DataService.reportOwnSickLeave({
        employeeId: employee.id,
        employeeName: employeeLabel(employee),
        startDate: start,
        endDate: end,
        reason: note.trim(),
        sickNoteFileId: upload.id,
        sickNoteUrl: upload.filePath
      })

      toast.success(
        `Krankmeldung gespeichert (${workingDays} Arbeitstag${workingDays !== 1 ? 'e' : ''}).`
      )
      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Die Krankmeldung konnte nicht gespeichert werden.')
    } finally {
      setIsSaving(false)
      setProgress('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Krankmeldung</h2>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <p className="sick-leave-hint">
              Zeitraum angeben und ein Bild der Arbeitsunfähigkeitsbescheinigung hochladen.
              Der Nachweis ist verpflichtend.
            </p>

            <div className="form-group">
              <label htmlFor="sick-start">Krank ab</label>
              <input
                id="sick-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  // Enddatum mitziehen, solange es davor läge
                  if (endDate < e.target.value) setEndDate(e.target.value)
                }}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="sick-end">Voraussichtlich bis</label>
              <input
                id="sick-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>

            {workingDays > 0 && (
              <p className="sick-leave-days">
                {workingDays} Arbeitstag{workingDays !== 1 ? 'e' : ''} (ohne Wochenende und Feiertage)
              </p>
            )}

            <div className="form-group">
              <label htmlFor="sick-note-file">
                Arbeitsunfähigkeitsbescheinigung <span className="sick-leave-required">*</span>
              </label>
              <input
                id="sick-note-file"
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => handleFileSelect(e.target.files)}
                required
              />
              {file && (
                <p className="sick-leave-filename">
                  {file.name}
                  {preview === '' && file.type === 'application/pdf' ? ' (PDF)' : ''}
                </p>
              )}
              {preview && (
                <img src={preview} alt="Vorschau der AU" className="sick-leave-preview" />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="sick-note-comment">Bemerkung (optional)</label>
              <textarea
                id="sick-note-comment"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="z. B. Folgebescheinigung"
              />
            </div>

            {progress && <p className="sick-leave-progress">{progress}</p>}

            <div className="modal-actions">
              <button type="button" className="btn secondary-btn" onClick={onClose} disabled={isSaving}>
                Abbrechen
              </button>
              <button type="submit" className="btn primary-btn" disabled={isSaving || !file}>
                {isSaving ? 'Speichert…' : 'Krankmeldung senden'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SickLeaveModal
