import React, { useMemo, useState } from 'react'
import { DataService } from '../services/dataService'
import type { Employee, SchoolDayKind } from '../types'
import { SCHOOL_DAY_LABELS } from '../types'
import { toast } from './ToastContainer'
import { getBavariaHolidayName } from '../utils/bavariaHolidays'
import '../styles/Modal.css'

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function employeeLabel(e: Employee): string {
  const parts = `${e.firstName || ''} ${e.lastName || ''}`.trim()
  return (e.name?.trim() || parts || e.username || '').trim()
}

interface SchoolDayModalProps {
  employee: Employee
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Ausbildungstag buchen – nur für Azubis.
 *
 * Der Tag wird als bezahlte Abwesenheit gebucht (kein Urlaubstag) und trägt
 * je nach Auswahl „Berufsschule“ oder „Handwerkskammer“ als Grund.
 */
const SchoolDayModal: React.FC<SchoolDayModalProps> = ({ employee, onClose, onSuccess }) => {
  const today = useMemo(() => toDateInputValue(new Date()), [])
  const [date, setDate] = useState(today)
  const [kind, setKind] = useState<SchoolDayKind | ''>('')
  const [isSaving, setIsSaving] = useState(false)

  const holidayName = useMemo(() => {
    const value = new Date(`${date}T12:00:00`)
    return isNaN(value.getTime()) ? null : getBavariaHolidayName(value)
  }, [date])

  const isWeekend = useMemo(() => {
    const value = new Date(`${date}T12:00:00`)
    if (isNaN(value.getTime())) return false
    const day = value.getDay()
    return day === 0 || day === 6
  }, [date])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!employee.id) {
      toast.error('Mitarbeiter konnte nicht ermittelt werden.')
      return
    }
    if (!kind) {
      toast.error('Bitte Berufsschule oder Handwerkskammer auswählen.')
      return
    }

    const value = new Date(`${date}T12:00:00`)
    if (isNaN(value.getTime())) {
      toast.error('Bitte ein gültiges Datum angeben.')
      return
    }

    setIsSaving(true)
    try {
      await DataService.reportOwnSchoolDay({
        employeeId: employee.id,
        employeeName: employeeLabel(employee),
        date: value,
        schoolKind: kind
      })
      toast.success(`${SCHOOL_DAY_LABELS[kind]} für den ${value.toLocaleDateString('de-DE')} gebucht.`)
      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Der Tag konnte nicht gebucht werden.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schule / Handwerkskammer</h2>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <p className="sick-leave-hint">
              Ausbildungstag buchen. Der Tag gilt als bezahlte Abwesenheit und wird nicht vom
              Urlaub abgezogen.
            </p>

            <div className="form-group">
              <label htmlFor="school-date">Tag</label>
              <input
                id="school-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              {isWeekend && (
                <p className="school-day-warning">
                  Der gewählte Tag ist ein Wochenende – er wird nicht als Arbeitstag gezählt.
                </p>
              )}
              {holidayName && (
                <p className="school-day-warning">
                  Der gewählte Tag ist ein Feiertag ({holidayName}) – er wird nicht als Arbeitstag gezählt.
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Grund</label>
              <div className="school-day-choices">
                {(Object.keys(SCHOOL_DAY_LABELS) as SchoolDayKind[]).map((option) => (
                  <label key={option} className="school-day-choice">
                    <input
                      type="radio"
                      name="schoolKind"
                      value={option}
                      checked={kind === option}
                      onChange={() => setKind(option)}
                    />
                    <span>{SCHOOL_DAY_LABELS[option]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn secondary-btn" onClick={onClose} disabled={isSaving}>
                Abbrechen
              </button>
              <button type="submit" className="btn primary-btn" disabled={isSaving || !kind}>
                {isSaving ? 'Speichert…' : 'Tag buchen'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SchoolDayModal
