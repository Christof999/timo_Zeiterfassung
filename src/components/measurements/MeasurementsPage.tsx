import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DataService } from '../../services/dataService'
import { getCurrentAdmin, getCurrentUser } from '../../services/data/session'
import { createMeasurementCustomer, createMeasurementOffer, getMeasurement, listMeasurements, newMeasurement, saveMeasurement, type MeasurementCustomerInput } from '../../services/data/measurements'
import type { Measurement } from '../../types/measurement'
import type { Customer } from '../../types'
import { deriveMeasurementPositions } from '../../utils/measurementText'
import EmployeePageHeader from '../EmployeePageHeader'
import SearchableSelect from '../SearchableSelect'
import '../../styles/Measurements.css'

function GrowingTextarea({ value, onChange, label, rows = 1, placeholder = '' }: { value: string; onChange: (value: string) => void; label: string; rows?: number; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${ref.current.scrollHeight + 2}px`
  }, [value])
  return <label>{label}<textarea aria-label={label} ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>
}

function MeasurementPageContent({ embedded, id }: { embedded: boolean; id?: string }) {
  const navigate = useNavigate()
  const employee = getCurrentUser()
  const admin = getCurrentAdmin()
  const author = employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || admin?.name || ''
  const authorized = !!employee || !!admin
  const [items, setItems] = useState<Measurement[]>([])
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerMode, setCustomerMode] = useState<'list' | 'new'>('list')
  const [newCustomer, setNewCustomer] = useState<MeasurementCustomerInput>(() => ({ id: crypto.randomUUID(), name: '', street: '', zipCode: '', city: '', email: '', phone: '' }))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [calculationNotices, setCalculationNotices] = useState<string[]>([])
  const [createdOffer, setCreatedOffer] = useState<{ id: string; number: string } | null>(null)

  useEffect(() => {
    if (!authorized) { navigate('/login', { replace: true }); return }
    let cancelled = false
    void (async () => {
      try {
        if (!id) {
          const rows = await listMeasurements()
          if (!cancelled) { setItems(rows); setMeasurement(null) }
        } else {
          const result = id === 'neu' ? newMeasurement(author) : await getMeasurement(id)
          if (!result) throw new Error('Aufmaß nicht gefunden.')
          if (!cancelled) setMeasurement(result)
          try {
            const all = await DataService.getActiveCustomers()
            if (!cancelled) setCustomers(all)
          } catch { if (!cancelled) setError('Der Kundenstamm konnte nicht geladen werden. Bitte erneut öffnen oder einen Kunden neu anlegen.') }
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Aufmaße konnten nicht geladen werden.') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [id, authorized, author, navigate])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function update(patch: Partial<Measurement>) {
    setMeasurement((current) => current ? { ...current, ...patch } : current)
    setDirty(true)
    setNotice('')
  }
  async function save(): Promise<boolean> {
    if (!measurement) return false
    try {
      await saveMeasurement(measurement)
      setDirty(false)
      setNotice('Aufmaß gespeichert.')
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); return false }
  }
  async function back() {
    if (busy) return
    setBusy(true)
    if (dirty && !await save()) { setBusy(false); return }
    if (id) navigate('/aufmass')
    else if (admin && !employee) navigate('/admin/dashboard', { state: { tab: 'measurements' } })
    else navigate('/time-tracking')
    setBusy(false)
  }
  async function addCustomer() {
    setBusy(true)
    setError('')
    try {
      await createMeasurementCustomer(newCustomer)
      const address = [newCustomer.street.trim(), [newCustomer.zipCode.trim(), newCustomer.city.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      const customer: Customer = { id: newCustomer.id, name: newCustomer.name.trim(), address, isActive: true, source: 'rechnung' }
      setCustomers((rows) => [...rows.filter((c) => c.id !== customer.id), customer])
      update({ customerId: customer.id, customerName: customer.name, ...(measurement?.address ? {} : { address }) })
      setCustomerMode('list')
      setNewCustomer({ id: crypto.randomUUID(), name: '', street: '', zipCode: '', city: '', email: '', phone: '' })
      setNotice('Kunde im gemeinsamen Kundenstamm angelegt. Bitte das Aufmaß speichern.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde konnte nicht angelegt werden.') }
    finally { setBusy(false) }
  }
  async function draft() {
    if (!measurement) return
    setBusy(true)
    setError('')
    try {
      if (!await save()) return
      const offer = await createMeasurementOffer(measurement)
      setCreatedOffer(offer)
      setNotice(`Angebotsentwurf ${offer.number} ist im Rechnungsprogramm verfügbar. Dort können Artikel und Preise ergänzt werden. Erneutes Erstellen verwendet denselben Entwurf und überschreibt keine Änderungen.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Entwurf konnte nicht erstellt werden.') }
    finally { setBusy(false) }
  }
  if (!authorized) return null
  return <div className={`measurements-page${embedded ? ' is-embedded' : ''}`}>
    {!embedded && <EmployeePageHeader title="Aufmaß" employee={employee} back={{ onClick: () => void back() }} />}
    <main className="measurements-main">
      {error && <p className="measurement-error" role="alert">{error}</p>}
      {notice && <p className="measurement-success" role="status">{notice}</p>}
      {createdOffer && <p><a href={`https://timo-rechnungsprogramm.vercel.app/angebote?open=${encodeURIComponent(createdOffer.id)}`} target="_blank" rel="noopener noreferrer">Angebotsentwurf {createdOffer.number} im Rechnungsprogramm öffnen ↗</a></p>}
      {loading ? <p>Lade Aufmaße…</p> : !id ? <>
        <div className="measurement-list-head"><div><h2>Aufmaße</h2><p>Maße aufnehmen und Angebote vorbereiten.</p></div><button className="btn primary-btn" onClick={() => navigate('/aufmass/neu')}>+ Neues Aufmaß</button></div>
        {!items.length && <p>Noch keine Aufmaße erfasst.</p>}
        <ul className="measurement-list">{items.map((m) => <li key={m.id}><button onClick={() => navigate(`/aufmass/${m.id}`)}><strong>{m.title || m.customerName || 'Aufmaß ohne Titel'}</strong><span>{m.customerName} · {m.address}</span><small>{m.updatedAt.toLocaleDateString('de-DE')} · {m.positions.length} Positionen · {m.createdBy}</small></button></li>)}</ul>
      </> : measurement && <>
        <fieldset disabled={busy} className="measurement-editor">
          <section className="measurement-card">
            <GrowingTextarea label="Bezeichnung / Ort" value={measurement.title} onChange={(title) => update({ title })} placeholder="Franken · Wohnheim · 1. OG links" />
            <div className="measurement-mode"><button type="button" aria-pressed={customerMode === 'list'} onClick={() => setCustomerMode('list')}>Kunde auswählen</button><button type="button" aria-pressed={customerMode === 'new'} onClick={() => { setCustomerMode('new'); update({ customerId: '', customerName: '' }) }}>+ Neuer Kunde</button></div>
            {customerMode === 'list' ? <label>Kunde<SearchableSelect value={measurement.customerId} options={[
              ...(!customers.some((c) => c.id === measurement.customerId) && measurement.customerId ? [{ value: measurement.customerId, label: measurement.customerName }] : []),
              ...customers.map((c) => ({ value: c.id, label: c.name }))
            ]} onChange={(customerId) => { const customer = customers.find((c) => c.id === customerId); if (customer) update({ customerId, customerName: customer.name, address: customer.siteAddress || customer.address || measurement.address }) }} placeholder="Kunde suchen…" /></label> : <div className="measurement-new-customer">
              <p>Der Kunde wird auch im Rechnungsprogramm angelegt.</p>
              {(['name', 'street', 'zipCode', 'city', 'email', 'phone'] as const).map((key) => <label key={key}>{{ name: 'Kundenname *', street: 'Straße / Hausnummer', zipCode: 'PLZ', city: 'Ort', email: 'E-Mail', phone: 'Telefon' }[key]}<input type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={newCustomer[key]} onChange={(e) => setNewCustomer({ ...newCustomer, [key]: e.target.value })} /></label>)}
              <button type="button" className="btn primary-btn" disabled={!newCustomer.name.trim()} onClick={() => void addCustomer()}>Kunden anlegen</button>
            </div>}
            <GrowingTextarea label="Baustellenadresse" value={measurement.address} onChange={(address) => update({ address })} placeholder="Oster Howser Straße 7, 1. OG links" />
          </section>
          <section className="measurement-card">
            <GrowingTextarea label="Aufmaßtext" rows={10} value={measurement.text} onChange={(text) => update({ text })} placeholder={'Bad Wand und Voranstrich\n(0,9 + 3,58) × 2,01 = 9,0048\n\nKunststoff Außenecke 5x'} />
            <p>Text eingeben oder einfügen. Das Feld wächst mit. Rechenzeilen werden neu berechnet; die Originalnotizen bleiben erhalten.</p>
            <button type="button" className="btn secondary-btn" disabled={!measurement.text.trim()} onClick={() => { if (measurement.positions.length && !window.confirm('Positionen erneut aus dem Text ableiten? Manuelle Änderungen an den Positionen werden dabei ersetzt.')) return; const derived = deriveMeasurementPositions(measurement.text); update({ positions: derived.positions, positionsSourceText: measurement.text }); setCalculationNotices(derived.notices) }}>Positionen aus Text ableiten</button>
          </section>
          {measurement.positions.length > 0 && <section className="measurement-card">
            <h2>Positionen prüfen</h2>
            <p>Mengen und Einheiten bitte prüfen. Positionen ohne Maß benötigen eine Menge. Die Preise werden im Angebotsentwurf ergänzt.</p>
            {measurement.positionsSourceText !== measurement.text && <p className="measurement-error">Der Text wurde geändert. Bitte die Positionen erneut ableiten.</p>}
            {calculationNotices.length > 0 && <ul className="measurement-calculation-notices">{calculationNotices.map((n, index) => <li key={index}>{n}</li>)}</ul>}
            {measurement.positions.map((position, index) => <div key={position.id} className="measurement-position">
              <label>Leistung<input value={position.shortText} onChange={(e) => update({ positions: measurement.positions.map((p, i) => i === index ? { ...p, shortText: e.target.value } : p) })} /></label>
              <label>Menge<input type="number" step="any" value={position.quantity ?? ''} onChange={(e) => update({ positions: measurement.positions.map((p, i) => i === index ? { ...p, quantity: e.target.value === '' ? null : Number(e.target.value) } : p) })} /></label>
              <label>Einheit<input list="measurement-units" value={position.unit} onChange={(e) => update({ positions: measurement.positions.map((p, i) => i === index ? { ...p, unit: e.target.value } : p) })} /></label>
              <button type="button" aria-label={`Position ${position.shortText} entfernen`} onClick={() => update({ positions: measurement.positions.filter((_, i) => i !== index) })}>×</button>
              {position.longText && <details><summary>Rechenweg / Originaltext</summary><pre>{position.longText}</pre></details>}
            </div>)}
            <datalist id="measurement-units"><option value="m²" /><option value="lfm" /><option value="Stück" /><option value="pauschal" /><option value="h" /></datalist>
            <button type="button" className="btn secondary-btn" onClick={() => update({ positions: [...measurement.positions, { id: crypto.randomUUID(), shortText: '', quantity: null, unit: '' }] })}>+ Position ergänzen</button>
          </section>}
          <div className="measurement-actions"><button type="button" className="btn secondary-btn" onClick={() => { setBusy(true); setError(''); void save().finally(() => setBusy(false)) }}>Aufmaß speichern{dirty ? ' *' : ''}</button><button type="button" className="btn primary-btn" disabled={!measurement.positions.length || !measurement.customerId || measurement.positionsSourceText !== measurement.text} onClick={() => void draft()}>Angebotsentwurf erstellen</button></div>
        </fieldset>
      </>}
    </main>
  </div>
}

export default function MeasurementsPage({ embedded = false }: { embedded?: boolean }) {
  const { id } = useParams<{ id: string }>()
  return <MeasurementPageContent key={id || 'list'} id={id} embedded={embedded} />
}
