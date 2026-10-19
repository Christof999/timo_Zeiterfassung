import React, { useEffect, useRef, useState } from 'react'
import type { Employee, Project } from '../types'
import { DataService } from '../services/dataService'
import { getSiteTripSettings } from '../services/siteTripSettingsService'
import {
  getRegieSignature,
  saveRegieSignature,
  type StoredRegieSignature
} from '../services/regieSignatureService'
import { countSiteTrips } from '../utils/siteTrips'
import { isOverheadProject } from '../constants/overheadProjects'
import {
  buildRegieDaySheets,
  buildRegieZettelHtml,
  isRegieSignatureOutdated,
  safeSignatureDataUrl,
  type RegieDaySheet,
  type RegiePrintedSignature
} from './admin/tabs/reports/regieZettel'
import { convertToDate, getDateKey } from './admin/tabs/reports/reportUtils'
import { toast } from './ToastContainer'
import '../styles/Modal.css'
import '../styles/EmployeeRegieModal.css'

interface EmployeeRegieModalProps {
  project: Project
  employee: Employee
  /** Einstempel-Tag der gerade abgeschlossenen Schicht. */
  workDate: Date
  onClose: () => void
}

const formatHours = (hours: number): string =>
  `${hours.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`

const openPrint = (html: string): boolean => {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    toast.error('Popup blockiert. Bitte Popups für diese Seite erlauben.')
    return false
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  const trigger = () => {
    printWindow.focus()
    printWindow.print()
  }
  printWindow.onload = () => window.setTimeout(trigger, 80)
  window.setTimeout(trigger, 350)
  return true
}

const EmployeeRegieModal: React.FC<EmployeeRegieModalProps> = ({
  project,
  employee,
  workDate,
  onClose
}) => {
  const dateKey = getDateKey(workDate)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<RegieDaySheet | null>(null)
  const [stored, setStored] = useState<StoredRegieSignature | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const entries = await DataService.getTimeEntriesByProject(project.id)
        const [employees, credits, tripSettings, signature] = await Promise.all([
          DataService.getAllEmployees().catch(() => [employee]),
          DataService.getMaterialCreditsByProject(project.id).catch(() => []),
          isOverheadProject(project) ? Promise.resolve({ flatRateEur: 0 }) : getSiteTripSettings(),
          getRegieSignature(project.id, dateKey).catch(() => null)
        ])
        if (cancelled) return
        const dayEntries = entries.filter((entry) => {
          const clockIn = convertToDate(entry.clockInTime)
          return !!clockIn && getDateKey(clockIn) === dateKey
        })
        const trips = isOverheadProject(project)
          ? []
          : countSiteTrips(
              project.id,
              dayEntries
                .filter((entry) => !entry.isVacationDay && convertToDate(entry.clockInTime))
                .map((entry) => ({
                  employeeId: entry.employeeId,
                  projectId: entry.projectId,
                  customerId: entry.customerId,
                  clockInTime: convertToDate(entry.clockInTime) as Date
                }))
            ).filter((trip) => trip.dateKey === dateKey)
        const sheets = buildRegieDaySheets({
          entries: dayEntries,
          employees,
          materialCredits: credits,
          siteTrips: trips,
          siteTripRate: tripSettings.flatRateEur
        })
        setSheet(sheets.find((item) => item.dateKey === dateKey) || null)
        setStored(signature)
        setSignerName(signature?.signerName || '')
      } catch (error) {
        console.error('Regiezettel konnte nicht geladen werden:', error)
        if (!cancelled) toast.error('Der Regiezettel konnte nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [project, dateKey])

  useEffect(() => {
    if (loading || !sheet) return
    let cancelled = false
    const prepare = () => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 20) {
        requestAnimationFrame(prepare)
        return
      }
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, rect.height)
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
    prepare()
    return () => {
      cancelled = true
    }
  }, [loading, sheet])

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d')
    const point = pointFrom(event)
    if (!ctx || !point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    setHasInk(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const point = pointFrom(event)
    if (!ctx || !point) return
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const stopDrawing = () => {
    drawing.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#1a1a1a'
    setHasInk(false)
  }

  const printedSignature = (
    dataUrl: string,
    name: string,
    signedAt: Date,
    outdated: boolean
  ): RegiePrintedSignature => ({
    dataUrl,
    signerName: name.trim() || undefined,
    signedAtLabel: signedAt.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }),
    outdated
  })

  const htmlFor = (signature?: RegiePrintedSignature) => {
    if (!sheet) return ''
    return buildRegieZettelHtml({
      sheets: [sheet],
      projectName: project.name || '',
      clientName: project.client || project.customerName || '',
      address: project.address || project.location || '',
      signatures: signature ? { [sheet.dateKey]: signature } : undefined
    })
  }

  const printWithoutSignature = () => {
    if (!sheet) return
    openPrint(htmlFor())
  }

  const signAndPrint = async () => {
    if (!sheet || saving) return
    const canvasUrl = hasInk ? canvasRef.current?.toDataURL('image/png') || '' : ''
    const freshUrl = safeSignatureDataUrl(canvasUrl)
    const storedUrl = safeSignatureDataUrl(stored?.signatureDataUrl)
    if (!freshUrl && !storedUrl) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Popup blockiert. Bitte Popups für diese Seite erlauben.')
      return
    }

    setSaving(true)
    let signature = stored
    try {
      if (freshUrl) {
        const next: StoredRegieSignature = {
          projectId: project.id,
          dateKey: sheet.dateKey,
          signatureDataUrl: freshUrl,
          signerName: signerName.trim(),
          signedAt: new Date(),
          capturedByEmployeeId: employee.id || '',
          capturedByName:
            employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
          signedEntryIds: sheet.entryIds,
          signedDayTotal: sheet.dayTotal
        }
        await saveRegieSignature(next)
        signature = next
        setStored(next)
        toast.success('Unterschrift gespeichert.')
      }
    } catch (error) {
      console.error('Unterschrift konnte nicht gespeichert werden:', error)
      toast.error('Die Unterschrift konnte nicht gespeichert werden. Sie steht trotzdem auf dem Ausdruck.')
      if (freshUrl) {
        signature = {
          projectId: project.id,
          dateKey: sheet.dateKey,
          signatureDataUrl: freshUrl,
          signerName: signerName.trim(),
          signedAt: new Date(),
          capturedByEmployeeId: employee.id || '',
          capturedByName: employee.name || '',
          signedEntryIds: sheet.entryIds,
          signedDayTotal: sheet.dayTotal
        }
      }
    } finally {
      setSaving(false)
    }

    const dataUrl = safeSignatureDataUrl(signature?.signatureDataUrl)
    const html = dataUrl
      ? htmlFor(
          printedSignature(
            dataUrl,
            signature?.signerName || '',
            signature?.signedAt || new Date(),
            signature ? isRegieSignatureOutdated(sheet, signature) : false
          )
        )
      : htmlFor()
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    const trigger = () => {
      printWindow.focus()
      printWindow.print()
    }
    printWindow.onload = () => window.setTimeout(trigger, 80)
    window.setTimeout(trigger, 350)
  }

  const storedUrl = safeSignatureDataUrl(stored?.signatureDataUrl)
  const outdated = !!(sheet && stored && isRegieSignatureOutdated(sheet, stored))

  return (
    <div className="modal-overlay">
      <div className="modal-content regie-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Regiezettel</h3>
          <button type="button" className="close-modal-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="regie-intro">
            Der heutige Zettel für {project.client || project.customerName || 'den Kunden'} auf{' '}
            {project.name || 'dem Projekt'}. Der Kunde kann ihn hier unterschreiben – oder Sie drucken
            ihn und lassen ihn auf Papier abzeichnen.
          </p>

          {loading ? (
            <p>Zettel wird erstellt…</p>
          ) : !sheet ? (
            <p>Für diesen Tag liegen keine abgeschlossenen Buchungen vor.</p>
          ) : (
            <>
              <p className="regie-date">{sheet.dateLabel}</p>
              <ul className="regie-lines">
                {sheet.labor.map((line, index) => (
                  <li key={`${line.employeeName}-${index}`}>
                    <strong>{line.employeeName}</strong> {line.clockIn}–{line.clockOut}
                    <span className="regie-amount">{formatHours(line.hours)}</span>
                  </li>
                ))}
                {sheet.materials.map((line) => (
                  <li key={line.name}>
                    {line.name}
                    <span className="regie-amount">
                      {line.quantity.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                      {line.unitLabel ? ` ${line.unitLabel}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {sheet.workNotes.length > 0 && (
                <ul className="regie-notes">
                  {sheet.workNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}

              {storedUrl && (
                <div className="regie-stored">
                  <img src={storedUrl} alt="Gespeicherte Unterschrift" />
                  <p>
                    Unterschrieben
                    {stored?.signerName ? ` von ${stored.signerName}` : ''} am{' '}
                    {stored?.signedAt.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}.
                  </p>
                  {outdated && (
                    <p className="regie-warn">
                      Seitdem kamen Buchungen dazu. Bitte den Kunden erneut unterschreiben lassen.
                    </p>
                  )}
                </div>
              )}

              <label className="regie-label" htmlFor="regie-signer">
                Name des Kunden (optional)
              </label>
              <input
                id="regie-signer"
                className="regie-signer"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                autoComplete="off"
                placeholder="z. B. Frau Berger"
              />
              <p className="regie-label">Unterschrift des Kunden</p>
              <canvas
                ref={canvasRef}
                className="regie-sign-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
              />
              <button type="button" className="btn secondary-btn regie-clear" onClick={clearSignature}>
                Unterschrift löschen
              </button>

              <div className="regie-actions">
                <button
                  type="button"
                  className="btn primary-btn"
                  onClick={() => void signAndPrint()}
                  disabled={saving || (!hasInk && !storedUrl)}
                >
                  {saving ? 'Speichere…' : hasInk ? 'Unterschreiben und drucken' : 'Mit Unterschrift drucken'}
                </button>
                <button type="button" className="btn secondary-btn" onClick={printWithoutSignature}>
                  Ohne Unterschrift drucken
                </button>
                <button type="button" className="btn secondary-btn" onClick={onClose}>
                  Fertig
                </button>
              </div>
            </>
          )}

          {!loading && !sheet && (
            <button type="button" className="btn secondary-btn" onClick={onClose}>
              Fertig
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default EmployeeRegieModal
