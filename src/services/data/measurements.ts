import { collection, doc, getDoc, getDocs, runTransaction, setDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { invoiceAuthReady, invoiceDbInstance } from '../invoiceFirebase'
import { authReady } from './shared'
import type { Measurement } from '../../types/measurement'
import { measurementOfferLines } from '../../utils/measurementText'
import { record, regieDate } from '../../utils/projectRegie'

const string = (value: unknown): string => typeof value === 'string' ? value : ''
function fromDoc(id: string, data: Record<string, unknown>): Measurement {
  const positions = Array.isArray(data.positions) ? data.positions.map((value) => {
    const p = record(value)
    return { id: string(p.id), shortText: string(p.shortText), longText: string(p.longText), group: string(p.group), unit: string(p.unit), quantity: typeof p.quantity === 'number' && Number.isFinite(p.quantity) ? p.quantity : null }
  }) : []
  return { id, title: string(data.title), customerId: string(data.customerId), customerName: string(data.customerName), address: string(data.address), text: string(data.text), positionsSourceText: string(data.positionsSourceText), createdBy: string(data.createdBy), updatedAt: regieDate(data.updatedAt) || new Date(0), positions }
}
export async function listMeasurements(): Promise<Measurement[]> {
  await authReady
  const snapshot = await getDocs(collection(db, 'measurements'))
  return snapshot.docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}
export async function getMeasurement(id: string): Promise<Measurement | null> {
  await authReady
  const snapshot = await getDoc(doc(db, 'measurements', id))
  return snapshot.exists() ? fromDoc(snapshot.id, snapshot.data()) : null
}
export function newMeasurement(createdBy: string): Measurement {
  return { id: doc(collection(db, 'measurements')).id, title: '', customerId: '', customerName: '', address: '', text: '', positions: [], positionsSourceText: '', createdBy, updatedAt: new Date() }
}
export async function saveMeasurement(measurement: Measurement): Promise<void> {
  await authReady
  const { id, ...data } = measurement
  await setDoc(doc(db, 'measurements', id), { ...data, updatedAt: new Date() })
}

export interface MeasurementCustomerInput {
  id: string
  name: string
  street: string
  zipCode: string
  city: string
  email: string
  phone: string
}
export async function createMeasurementCustomer(input: MeasurementCustomerInput): Promise<void> {
  const invoiceDb = invoiceDbInstance
  if (!invoiceDb) throw new Error('Die Verbindung zum Rechnungsprogramm ist nicht eingerichtet.')
  if (!input.name.trim()) throw new Error('Bitte einen Kundennamen eingeben.')
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')
  await invoiceAuthReady
  await runTransaction(invoiceDb, async (tx) => {
    const ref = doc(invoiceDb, 'customers', input.id)
    if ((await tx.get(ref)).exists()) return
    tx.set(ref, { name: input.name.trim(), address: { street: input.street.trim(), zipCode: input.zipCode.trim(), city: input.city.trim(), country: 'Deutschland' }, contact: { email: input.email.trim(), phone: input.phone.trim() }, isActive: true, createdAt: new Date(), updatedAt: new Date() })
  })
}

/** Eine feste Dokument-ID verhindert doppelte Entwürfe nach Abbruch oder erneutem Klick. */
export async function createMeasurementOffer(measurement: Measurement): Promise<{ id: string; number: string }> {
  const invoiceDb = invoiceDbInstance
  if (!invoiceDb) throw new Error('Die Verbindung zum Rechnungsprogramm ist nicht eingerichtet.')
  if (!measurement.customerId) throw new Error('Bitte zuerst einen Kunden auswählen oder anlegen.')
  if (measurement.text !== measurement.positionsSourceText) throw new Error('Der Aufmaßtext wurde geändert. Bitte Positionen erneut ableiten und prüfen.')
  const lines = measurementOfferLines(measurement.positions)
  await invoiceAuthReady
  return runTransaction(invoiceDb, async (tx) => {
    const id = `aufmass_${measurement.id}`
    const offerRef = doc(invoiceDb, 'offers', id)
    const existing = await tx.get(offerRef)
    if (existing.exists()) return { id, number: string(existing.data().offerNumber) }
    const customer = await tx.get(doc(invoiceDb, 'customers', measurement.customerId))
    if (!customer.exists()) throw new Error('Der ausgewählte Kunde existiert nicht mehr.')
    const now = new Date()
    const sequenceRef = doc(invoiceDb, 'numberSequences', String(now.getFullYear()))
    const sequence = await tx.get(sequenceRef)
    if (!sequence.exists()) throw new Error('Die Angebotsnummern für dieses Jahr sind im Rechnungsprogramm noch nicht eingerichtet.')
    const current: unknown = sequence.data().offerSequence
    if (typeof current !== 'number' || !Number.isInteger(current) || current < 0) throw new Error('Ungültiger Angebotsnummernkreis.')
    const number = `AN-${now.getFullYear()}-${String(current + 1).padStart(4, '0')}`
    const validUntil = new Date(now)
    validUntil.setDate(validUntil.getDate() + 30)
    tx.update(sequenceRef, { offerSequence: current + 1 })
    tx.set(offerRef, { offerNumber: number, customerId: measurement.customerId, status: 'draft', date: now, validUntil, lines,
      subtotalNet: 0, subtotalGross: 0, totalTax: 0, totalAmount: 0,
      notes: `Aufmaß: ${measurement.title}\n${measurement.address}\n\n${measurement.text}`, measurementId: measurement.id,
      createdBy: measurement.createdBy, createdAt: now, updatedAt: now })
    return { id, number }
  })
}
