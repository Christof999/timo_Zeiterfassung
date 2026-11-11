import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { AdminRole, Employee, TimeEntry, Project } from '../../types'
import { ADMIN_ROLE_LABELS, resolveAdminRole } from '../../utils/adminRole'
import { toast } from '../ToastContainer'
import { DEFAULT_MEAL_ALLOWANCE_EUR } from './tabs/reports/reportUtils'
import EmployeeTimeEntriesSection from './EmployeeTimeEntriesSection'
import EmployeeAbsenceHistory from './EmployeeAbsenceHistory'
import TimeEntryReportModal from './TimeEntryReportModal'
import { FULL_TIME_MONTHLY_VACATION_DAYS } from '../../utils/vacationAccount'
import '../../styles/Modal.css'

/** „12,5" → 12.5; leer oder ungültig → null. */
const parseDecimal = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const decimalLabel = (value: number | undefined): string =>
  value == null ? '' : String(value).replace('.', ',')

interface EmployeeModalProps {
  employee: Employee | null
  onClose: () => void
  onSave: () => void
}

const EmployeeModal: React.FC<EmployeeModalProps> = ({ employee, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    name: '',
    username: '',
    password: '',
    position: '',
    status: 'active' as 'active' | 'inactive',
    hourlyRate: 0,
    hourlyCostRate: 0,
    ancillaryWageCosts: 0,
    mealAllowanceRate: DEFAULT_MEAL_ALLOWANCE_EUR,
    isApprentice: false,
    fixedMonthlySalary: 0,
    overtimeBalanceHours: '' as string,
    payrollMonth: '',
    vacationOpeningDays: '',
    monthlyVacationDays: decimalLabel(FULL_TIME_MONTHLY_VACATION_DAYS),
    overtimeOpeningHours: '',
    heroEmployeeId: '',
    isAdmin: false,
    adminRole: 'full' as AdminRole
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isRecomputingOvertime, setIsRecomputingOvertime] = useState(false)
  // Ausgewählter Stempelsatz für den Detail-Bericht (Modal über dem Mitarbeiter-Fenster)
  const [reportEntry, setReportEntry] = useState<{ entry: TimeEntry; project: Project | null } | null>(null)

  const handleRecomputeOvertime = async () => {
    if (!employee?.id) return
    setIsRecomputingOvertime(true)
    try {
      const minutes = await DataService.recomputeOvertimeBalance(employee.id)
      const hours = Math.round((minutes / 60) * 100) / 100
      setFormData((prev) => ({ ...prev, overtimeBalanceHours: String(hours).replace('.', ',') }))
      toast.success(`Überstunden neu berechnet: ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`)
    } catch (error: any) {
      toast.error('Neuberechnung fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsRecomputingOvertime(false)
    }
  }

  useEffect(() => {
    if (employee) {
      // Wenn firstName/lastName vorhanden sind, verwende diese
      // Ansonsten versuche name zu splitten
      let firstName = employee.firstName || ''
      let lastName = employee.lastName || ''
      
      // Wenn firstName/lastName leer sind, aber name vorhanden ist, splitte name
      if ((!firstName || !lastName) && employee.name) {
        const nameParts = employee.name.trim().split(/\s+/)
        if (nameParts.length >= 2) {
          firstName = nameParts[0]
          lastName = nameParts.slice(1).join(' ') // Rest als Nachname (falls mehrere Wörter)
        } else if (nameParts.length === 1) {
          firstName = nameParts[0]
          lastName = ''
        }
      }
      
      const obm = employee.overtimeBalanceMinutes
      const overtimeBalanceHours =
        obm != null && typeof obm === 'number' && !isNaN(obm)
          ? String(Math.round((obm / 60) * 100) / 100)
          : ''

      setFormData({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: employee.name || '',
        username: employee.username || '',
        password: '',
        position: employee.position || '',
        status: (employee.status as 'active' | 'inactive') || 'active',
        hourlyRate: employee.hourlyRate || employee.hourlyWage || 0,
        hourlyCostRate: employee.hourlyCostRate || 0,
        ancillaryWageCosts: employee.ancillaryWageCosts || 0,
        mealAllowanceRate:
          typeof employee.mealAllowanceRate === 'number'
            ? employee.mealAllowanceRate
            : DEFAULT_MEAL_ALLOWANCE_EUR,
        isApprentice: employee.isApprentice === true,
        fixedMonthlySalary: employee.fixedMonthlySalary || 0,
        overtimeBalanceHours,
        payrollMonth: employee.vacationAccount?.asOfMonth || employee.overtimeOpening?.asOfMonth || '',
        vacationOpeningDays: decimalLabel(employee.vacationAccount?.openingDays),
        monthlyVacationDays: decimalLabel(employee.vacationAccount?.monthlyDays ?? FULL_TIME_MONTHLY_VACATION_DAYS),
        overtimeOpeningHours:
          employee.overtimeOpening != null ? decimalLabel(Math.round((employee.overtimeOpening.minutes / 60) * 100) / 100) : '',
        heroEmployeeId: employee.heroEmployeeId || '',
        isAdmin: (employee as any).isAdmin === true,
        adminRole: resolveAdminRole(employee)
      })
    } else {
      // Reset form when no employee (new employee)
      setFormData({
        firstName: '',
        lastName: '',
        name: '',
        username: '',
        password: '',
        position: '',
        status: 'active',
        hourlyRate: 0,
        hourlyCostRate: 0,
        ancillaryWageCosts: 0,
        mealAllowanceRate: DEFAULT_MEAL_ALLOWANCE_EUR,
        isApprentice: false,
        fixedMonthlySalary: 0,
        overtimeBalanceHours: '',
        payrollMonth: '',
        vacationOpeningDays: '',
        monthlyVacationDays: decimalLabel(FULL_TIME_MONTHLY_VACATION_DAYS),
        overtimeOpeningHours: '',
        heroEmployeeId: '',
        isAdmin: false,
        adminRole: 'full'
      })
    }
  }, [employee])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const employeeData: Partial<Employee> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        username: formData.username,
        position: formData.position,
        status: formData.status,
        hourlyRate: formData.hourlyRate,
        hourlyCostRate: formData.hourlyCostRate,
        ancillaryWageCosts: formData.ancillaryWageCosts,
        mealAllowanceRate: formData.mealAllowanceRate,
        isApprentice: formData.isApprentice,
        // Ohne Azubi-Kennzeichen darf kein Fixlohn stehen bleiben – sonst
        // rechnet der Bericht später mit einem Wert, den niemand mehr sieht.
        fixedMonthlySalary: formData.isApprentice ? formData.fixedMonthlySalary : 0,
        heroEmployeeId: formData.heroEmployeeId.trim() || undefined,
        isAdmin: formData.isAdmin,
        adminRole: formData.adminRole
      }

      const trimmedOt = formData.overtimeBalanceHours.trim()
      if (trimmedOt === '') {
        employeeData.overtimeBalanceMinutes = null
      } else {
        const h = parseFloat(trimmedOt.replace(',', '.'))
        if (!isNaN(h) && h >= 0) {
          employeeData.overtimeBalanceMinutes = Math.round(h * 60)
        }
      }

      // Stand laut Lohnabrechnung: nur vollständig übernehmen.
      const openingDays = parseDecimal(formData.vacationOpeningDays)
      const monthlyDays = parseDecimal(formData.monthlyVacationDays)
      const openingOvertimeHours = parseDecimal(formData.overtimeOpeningHours)
      if ((openingDays != null || openingOvertimeHours != null) && !formData.payrollMonth) {
        toast.error('Bitte den Monat der Lohnabrechnung angeben.')
        setIsLoading(false)
        return
      }
      if (openingDays != null) {
        if (monthlyDays == null) {
          toast.error('Bitte den Urlaubsanspruch je Monat angeben (Vollzeit Bau: 2,5).')
          setIsLoading(false)
          return
        }
        employeeData.vacationAccount = { openingDays, asOfMonth: formData.payrollMonth, monthlyDays }
      }
      const overtimeOpening =
        openingOvertimeHours != null
          ? { minutes: Math.round(openingOvertimeHours * 60), asOfMonth: formData.payrollMonth }
          : null
      const overtimeOpeningChanged =
        overtimeOpening != null &&
        (overtimeOpening.minutes !== employee?.overtimeOpening?.minutes ||
          overtimeOpening.asOfMonth !== employee?.overtimeOpening?.asOfMonth)
      if (overtimeOpening) employeeData.overtimeOpening = overtimeOpening

      if (formData.password) {
        employeeData.password = formData.password
      }

      let employeeId = employee?.id
      if (employeeId) {
        await DataService.updateEmployee(employeeId, employeeData)
        toast.success('Mitarbeiter erfolgreich aktualisiert')
      } else {
        if (!formData.password) {
          toast.error('Bitte geben Sie ein Passwort ein')
          setIsLoading(false)
          return
        }
        employeeId = await DataService.createEmployee(employeeData)
        toast.success('Mitarbeiter erfolgreich erstellt')
      }

      // Neuer Stand aus der Lohnabrechnung → Konto ab diesem Stand neu aufbauen,
      // sonst bliebe der alte, selbst gezählte Saldo stehen.
      if (overtimeOpeningChanged && employeeId) {
        await DataService.recomputeOvertimeBalance(employeeId)
      }

      onSave()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{employee ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Vorname:</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Nachname:</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Benutzername:</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Passwort {employee ? '(leer lassen zum Beibehalten)' : ''}:</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!employee}
            />
          </div>
          <div className="form-group">
            <label>Position:</label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Stundensatz (Verrechnung, €/Std):</label>
            <input
              type="number"
              step="0.01"
              value={formData.hourlyRate}
              onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-group">
            <label>Kostensatz (was kostet mich der Mitarbeiter, €/Std):</label>
            <input
              type="number"
              step="0.01"
              value={formData.hourlyCostRate}
              onChange={(e) => setFormData({ ...formData, hourlyCostRate: parseFloat(e.target.value) || 0 })}
            />
            <small className="form-hint">
              Interner Kostensatz (analog Material-Einkaufspreis). Zusammen mit den
              Lohnnebenkosten ist er die Lohnbasis im Zeiterfassungsbericht; die Differenz
              zum Verrechnungssatz wird in der Nachkalkulation als Personalmarge ausgewiesen.
            </small>
          </div>
          <div className="form-group">
            <label>Lohnnebenkosten (€/Std):</label>
            <input
              type="number"
              step="0.01"
              value={formData.ancillaryWageCosts}
              onChange={(e) =>
                setFormData({ ...formData, ancillaryWageCosts: parseFloat(e.target.value) || 0 })
              }
            />
            <small className="form-hint">
              Frei befüllbar – z. B. Sozialabgaben, Umlagen und sonstige Zuschläge zum Lohn.
              Wird im Zeiterfassungsbericht zum Kostensatz addiert und ergibt die Lohnbasis.
            </small>
          </div>
          <div className="form-group">
            <label>Verpflegungsmehraufwand (€/Tag):</label>
            <input
              type="number"
              step="0.01"
              value={formData.mealAllowanceRate}
              onChange={(e) =>
                setFormData({ ...formData, mealAllowanceRate: parseFloat(e.target.value) || 0 })
              }
            />
            <small className="form-hint">
              Steuerfreier Satz je Tag mit mindestens 8 Std Anwesenheit. Gilt als Vorgabe im
              Zeiterfassungsbericht; dort lässt er sich für einen einzelnen Bericht noch
              überschreiben. 0 ist zulässig.
            </small>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={formData.isApprentice}
                onChange={(e) => setFormData({ ...formData, isApprentice: e.target.checked })}
                style={{ width: 'auto', minHeight: 0 }}
              />
              Azubi (Vergütung als Fixlohn statt nach Stunden)
            </label>
          </div>
          {formData.isApprentice && (
            <div className="form-group">
              <label>Fixlohn (€/Monat):</label>
              <input
                type="number"
                step="0.01"
                value={formData.fixedMonthlySalary}
                onChange={(e) =>
                  setFormData({ ...formData, fixedMonthlySalary: parseFloat(e.target.value) || 0 })
                }
              />
              <small className="form-hint">
                Monatliche Ausbildungsvergütung. Im Zeiterfassungsbericht werden dann nur die
                abgerechneten Zeiten ausgewiesen – ohne Stundensatz – und der Fixlohn als
                Bruttolohn.
              </small>
            </div>
          )}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={formData.isAdmin}
                onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                style={{ width: 'auto', minHeight: 0 }}
              />
              Administrator (darf sich im Admin-Bereich anmelden)
            </label>
          </div>
          {formData.isAdmin && (
            <div className="form-group">
              <label>Umfang der Admin-Rechte:</label>
              <select
                value={formData.adminRole}
                onChange={(e) =>
                  setFormData({ ...formData, adminRole: e.target.value as AdminRole })
                }
              >
                {(Object.keys(ADMIN_ROLE_LABELS) as AdminRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ADMIN_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <small className="form-hint">
                „Nur Lohnabrechnung“ blendet Übersicht, Projekte, Kunden, Material und
                Nachkalkulation aus – es bleiben Zeiterfassungsbericht, Mitarbeiter und
                Urlaub (dort werden Krankmeldungen erfasst).
              </small>
            </div>
          )}
          <div className="form-group">
            <label>Überstunden-Saldo (Stunden, optional):</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="z.B. 12,5 — aus Zeiten (Tages-Summe über 8,5 Std) berechnet"
              value={formData.overtimeBalanceHours}
              onChange={e => setFormData({ ...formData, overtimeBalanceHours: e.target.value })}
            />
            {employee?.id && (
              <button
                type="button"
                className="btn secondary-btn btn-sm"
                style={{ marginTop: 6 }}
                onClick={handleRecomputeOvertime}
                disabled={isRecomputingOvertime}
              >
                {isRecomputingOvertime ? 'Berechne…' : 'Aus Zeiten neu berechnen'}
              </button>
            )}
          </div>
          <fieldset className="form-group">
            <legend>Stand laut Lohnabrechnung</legend>
            <label htmlFor="payroll-month">Monat der Lohnabrechnung:</label>
            <input
              id="payroll-month"
              type="month"
              value={formData.payrollMonth}
              onChange={e => setFormData({ ...formData, payrollMonth: e.target.value })}
            />
            <label htmlFor="vacation-opening">Resturlaub (Tage):</label>
            <input
              id="vacation-opening"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 11 oder 8,92"
              value={formData.vacationOpeningDays}
              onChange={e => setFormData({ ...formData, vacationOpeningDays: e.target.value })}
            />
            <label htmlFor="vacation-monthly">Urlaubsanspruch je Monat (Tage):</label>
            <input
              id="vacation-monthly"
              type="text"
              inputMode="decimal"
              value={formData.monthlyVacationDays}
              onChange={e => setFormData({ ...formData, monthlyVacationDays: e.target.value })}
            />
            <label htmlFor="overtime-opening">Überstunden (Stunden, optional):</label>
            <input
              id="overtime-opening"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 46,5"
              value={formData.overtimeOpeningHours}
              onChange={e => setFormData({ ...formData, overtimeOpeningHours: e.target.value })}
            />
            <small>
              Bau Vollzeit: 2,5 Tage je Monat. Ein Monat wird gutgeschrieben, sobald er vorbei ist.
              Neue Überstunden zählen ab dem Folgemonat dazu.
            </small>
          </fieldset>
          <div className="form-group">
            <label>Personalnummer (optional):</label>
            <input
              type="text"
              value={formData.heroEmployeeId}
              onChange={(e) => setFormData({ ...formData, heroEmployeeId: e.target.value })}
              placeholder="Erscheint auf dem DATEV-Nachweis"
            />
          </div>
          <div className="form-group">
            <label>Status:</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn secondary-btn">
              Abbrechen
            </button>
            <button type="submit" className="btn primary-btn" disabled={isLoading}>
              {isLoading ? 'Speichere...' : 'Speichern'}
            </button>
          </div>

          {employee?.id && <EmployeeAbsenceHistory employeeId={employee.id} />}

          {employee?.id && (
            <EmployeeTimeEntriesSection
              employeeId={employee.id}
              onSelectEntry={(entry, project) => setReportEntry({ entry, project })}
            />
          )}
        </form>
      </div>
    </div>

    {reportEntry && (
      <TimeEntryReportModal
        entry={reportEntry.entry}
        project={reportEntry.project}
        onClose={() => setReportEntry(null)}
      />
    )}
    </>
  )
}

export default EmployeeModal

