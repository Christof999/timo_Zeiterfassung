import React, { useMemo } from 'react'
import type { Employee, MaterialType, Project, TimeEntry } from '../../types'
import { buildDailyReport } from './dailyReport'
import '../../styles/DailyReportModal.css'

interface DailyReportModalProps {
  entries: TimeEntry[]
  employees: Employee[]
  projects: Project[]
  materialTypes: MaterialType[]
  onClose: () => void
}

const fmtEur = (n: number): string =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const fmtHours = (n: number): string => {
  const totalMin = Math.round(n * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${m.toString().padStart(2, '0')} h`
}

const DailyReportModal: React.FC<DailyReportModalProps> = ({
  entries,
  employees,
  projects,
  materialTypes,
  onClose
}) => {
  const report = useMemo(
    () => buildDailyReport(entries, employees, projects, materialTypes),
    [entries, employees, projects, materialTypes]
  )

  const todayLabel = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

  const hasMaterial = report.materials.length > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content daily-report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Tagesbericht</h2>
            <p className="daily-report-subtitle">{todayLabel}</p>
          </div>
          <button type="button" className="close-modal-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="modal-body daily-report-body">
          {report.employees.length === 0 ? (
            <p className="no-data">Heute wurden noch keine Zeiten erfasst.</p>
          ) : (
            <>
              {/* Kennzahlen oben */}
              <div className="daily-report-kpis">
                <div className="daily-kpi kpi-hours">
                  <span className="daily-kpi-icon" aria-hidden="true">🕒</span>
                  <span className="daily-kpi-label">Gearbeitete Stunden</span>
                  <span className="daily-kpi-value">{fmtHours(report.totalHours)}</span>
                </div>
                <div className="daily-kpi kpi-labor">
                  <span className="daily-kpi-icon" aria-hidden="true">💶</span>
                  <span className="daily-kpi-label">Lohn-Hochrechnung</span>
                  <span className="daily-kpi-value">{fmtEur(report.totalLaborCost)}</span>
                </div>
                {hasMaterial && (
                  <div className="daily-kpi kpi-margin">
                    <span className="daily-kpi-icon" aria-hidden="true">📈</span>
                    <span className="daily-kpi-label">Material-Marge</span>
                    <span className="daily-kpi-value">{fmtEur(report.materialMarginTotal)}</span>
                  </div>
                )}
              </div>

              {report.hasOpenEntries && (
                <p className="daily-report-hint">
                  Einige Mitarbeiter sind noch eingestempelt – deren Stunden sind bis jetzt gerechnet.
                </p>
              )}

              {/* Mitarbeiter → Stunden je Projekt + Lohn */}
              <section className="daily-report-section">
                <h3 className="daily-section-title"><span aria-hidden="true">👷</span> Mitarbeiter &amp; Stunden</h3>
                <div className="daily-table-wrap">
                  <table className="daily-table">
                    <thead>
                      <tr>
                        <th>Mitarbeiter</th>
                        <th>Projekt(e)</th>
                        <th className="num">Stunden</th>
                        <th className="num">Satz</th>
                        <th className="num">Lohn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.employees.map((emp) => (
                        <tr key={emp.employeeId}>
                          <td>
                            {emp.employeeName}
                            {emp.hasOpenEntry && <span className="daily-open-badge">läuft</span>}
                          </td>
                          <td>
                            <ul className="daily-project-list">
                              {emp.projects.map((p) => (
                                <li key={p.projectName}>
                                  <span className="daily-project-name">{p.projectName}</span>
                                  <span className="daily-project-hours">{fmtHours(p.hours)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="num">{fmtHours(emp.totalHours)}</td>
                          <td className="num">{emp.hourlyRate > 0 ? fmtEur(emp.hourlyRate) : '—'}</td>
                          <td className="num">{emp.hourlyRate > 0 ? fmtEur(emp.laborCost) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>
                          <strong>Gesamt</strong>
                        </td>
                        <td className="num">
                          <strong>{fmtHours(report.totalHours)}</strong>
                        </td>
                        <td className="num"></td>
                        <td className="num">
                          <strong>{fmtEur(report.totalLaborCost)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* Material kumuliert */}
              <section className="daily-report-section">
                <h3 className="daily-section-title"><span aria-hidden="true">📦</span> Material (alle Mitarbeiter)</h3>
                {!hasMaterial ? (
                  <p className="no-data">Heute wurde kein Material verbucht.</p>
                ) : (
                  <div className="daily-table-wrap">
                    <table className="daily-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="num">Menge</th>
                          <th className="num">Verkauf</th>
                          <th className="num">Einkauf</th>
                          <th className="num">Marge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.materials.map((m) => {
                          const margin = m.hasPurchase ? m.salesCost - m.purchaseCost : null
                          return (
                            <tr key={m.key}>
                              <td>{m.name}</td>
                              <td className="num">
                                {m.quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                                {m.unitLabel ? ` ${m.unitLabel}` : ''}
                              </td>
                              <td className="num">{m.salesUnitEur != null ? fmtEur(m.salesCost) : '—'}</td>
                              <td className="num">{m.hasPurchase ? fmtEur(m.purchaseCost) : '—'}</td>
                              <td className={`num ${margin != null && margin < 0 ? 'daily-margin-neg' : 'daily-margin-pos'}`}>
                                {margin != null ? fmtEur(margin) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>
                            <strong>Summen</strong>
                          </td>
                          <td className="num">
                            <strong>{fmtEur(report.materialSalesTotal)}</strong>
                          </td>
                          <td className="num">
                            <strong>{fmtEur(report.materialPurchaseTotal)}</strong>
                          </td>
                          <td className="num">
                            <strong>{fmtEur(report.materialMarginTotal)}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* Überblick / Marge */}
              <section className="daily-report-section daily-report-overview">
                <h3 className="daily-section-title"><span aria-hidden="true">🧮</span> Überblick</h3>
                <div className="daily-overview-grid">
                  <div className="daily-overview-row">
                    <span>Lohn-Hochrechnung (Stunden × Satz)</span>
                    <strong>{fmtEur(report.totalLaborCost)}</strong>
                  </div>
                  {hasMaterial && (
                    <>
                      <div className="daily-overview-row">
                        <span>Material – Verkauf</span>
                        <strong>{fmtEur(report.materialSalesTotal)}</strong>
                      </div>
                      <div className="daily-overview-row">
                        <span>Material – Einkauf</span>
                        <strong>{fmtEur(report.materialPurchaseTotal)}</strong>
                      </div>
                      <div className="daily-overview-row daily-overview-margin">
                        <span>Material – Marge (Verkauf − Einkauf)</span>
                        <strong>{fmtEur(report.materialMarginTotal)}</strong>
                      </div>
                    </>
                  )}
                </div>
                <p className="daily-report-note">
                  Lohn-Hochrechnung = gearbeitete Stunden je Mitarbeiter × Stundensatz. In Einkauf/Marge
                  fließen nur Materialpositionen mit hinterlegtem Einkaufspreis ein.
                </p>
              </section>
            </>
          )}

          <div className="form-group text-center daily-report-actions">
            <button type="button" className="btn secondary-btn" onClick={onClose}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DailyReportModal
