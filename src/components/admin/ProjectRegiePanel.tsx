import { useEffect, useState } from 'react'
import { db } from '../../services/firebaseConfig'
import { authReady } from '../../services/data/shared'
import { DataService } from '../../services/dataService'
import { loadProjectRegie } from '../../services/projectRegieStore'
import { downloadProjectRegie, projectRegiePdf } from '../../utils/projectRegiePdf'
import { sendReportMail, isValidEmail } from '../../services/reportMailService'
import type { ProjectRegie } from '../../utils/projectRegie'
import type { Project } from '../../types'

export default function ProjectRegiePanel({ project }: { project: Project }) {
  const [report, setReport] = useState<ProjectRegie | null>(null)
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await authReady
        const result = await loadProjectRegie(db, project.id)
        if (!cancelled) setReport(result)
        const customers = await DataService.getAllCustomers()
        if (!cancelled) setRecipient(customers.find((c) => c.id === project.customerId)?.email || '')
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Bericht konnte nicht geladen werden.') }
    })()
    return () => { cancelled = true }
  }, [project.id, project.customerId])
  async function act(send: boolean) {
    setBusy(true)
    setMessage('')
    try {
      const latest = await loadProjectRegie(db, project.id)
      setReport(latest)
      const bytes = await projectRegiePdf(latest)
      if (send) {
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        await sendReportMail({ to: recipient.trim(), reportKind: 'project-regie', employeeName: latest.projectName,
          periodLabel: 'Gesamte Projektlaufzeit', totalHours: '', grossWage: '',
          reports: [{ filename: 'Regiebericht-gesamt.pdf', contentBase64: btoa(binary) }] })
        setMessage('Gesamt-Regiebericht wurde versendet.')
      } else downloadProjectRegie(bytes)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Bericht konnte nicht erstellt werden.') }
    finally { setBusy(false) }
  }
  return <section className="project-regie-panel" style={{ margin: '16px 0', padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
    <h3>Regiebericht gesamt</h3>
    <p>Gesamte Projektlaufzeit · Stunden, Material und Tagesnachweise</p>
    {report && <ul>{report.quantities.map((q) => <li key={q.key}>{q.name}: {q.quantity.toLocaleString('de-DE')} {q.unit}</li>)}</ul>}
    <button type="button" className="btn secondary-btn" disabled={busy || !report} onClick={() => void act(false)}>Gesamtbericht als PDF</button>
    <label style={{ display: 'block', marginTop: 12 }}>E-Mail des Kunden
      <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} disabled={busy} />
    </label>
    <button type="button" className="btn primary-btn" disabled={busy || !report || !isValidEmail(recipient)} onClick={() => void act(true)}>{busy ? 'Bitte warten…' : 'Gesamtbericht an Kunden senden'}</button>
    {message && <p role="status">{message}</p>}
  </section>
}
