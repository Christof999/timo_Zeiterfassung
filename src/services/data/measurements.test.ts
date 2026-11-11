import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Measurement } from '../../types/measurement'
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), writes: 0 }))
vi.mock('../firebaseConfig', () => ({ db: { name: 'time' } }))
vi.mock('../invoiceFirebase', () => ({ invoiceDbInstance: { name: 'invoice' }, invoiceAuthReady: Promise.resolve() }))
vi.mock('./shared', () => ({ authReady: Promise.resolve() }))
vi.mock('firebase/firestore', () => {
  const snapshot = (key: string) => ({ exists: () => state.docs.has(key), data: () => state.docs.get(key) || {} })
  return {
    doc: (db: { name: string }, name: string, id: string) => `${db.name}/${name}/${id}`,
    collection: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(),
    getDoc: async (key: string) => snapshot(key),
    runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      const pending: (() => void)[] = []
      const result = await callback({
        get: async (key: string) => snapshot(key),
        set: (key: string, value: Record<string, unknown>) => pending.push(() => state.docs.set(key, value)),
        update: (key: string, value: Record<string, unknown>) => pending.push(() => state.docs.set(key, { ...state.docs.get(key), ...value }))
      })
      for (const write of pending) { write(); state.writes++ }
      return result
    }
  }
})
import { createMeasurementCustomer, createMeasurementOffer } from './measurements'

const measurement: Measurement = {
  id: 'm1', title: 'Bad Wohnheim', address: 'Musterweg 7', customerId: 'c1', customerName: 'Franken',
  text: 'Bad Wand\n2 × 3', positionsSourceText: 'Bad Wand\n2 × 3',
  positions: [{ id: 'p1', shortText: 'Bad Wand', longText: '2 × 3', quantity: 6, unit: 'm²' }], createdBy: 'Max', updatedAt: new Date()
}
beforeEach(() => {
  state.docs.clear()
  state.writes = 0
  state.docs.set('invoice/customers/c1', { name: 'Franken' })
  state.docs.set(`invoice/numberSequences/${new Date().getFullYear()}`, { offerSequence: 12, invoiceSequence: 42 })
})

describe('Angebotsentwurf aus Aufmaß', () => {
  it('erstellt einen regulären Angebotsentwurf mit Kundenzuordnung, Originalmaßen und fortlaufender Nummer', async () => {
    const result = await createMeasurementOffer(measurement)
    expect(result).toEqual({ id: 'aufmass_m1', number: `AN-${new Date().getFullYear()}-0013` })
    expect(state.docs.get('invoice/offers/aufmass_m1')).toMatchObject({
      status: 'draft', customerId: 'c1', measurementId: 'm1', totalAmount: 0,
      lines: [{ description: 'Bad Wand\n2 × 3', quantity: 6, unit: 'm²', unitPriceNet: 0, taxRate: 19 }]
    })
    expect(state.docs.get('invoice/offers/aufmass_m1')?.notes).toContain(measurement.text)
    expect(state.docs.get(`invoice/numberSequences/${new Date().getFullYear()}`)).toEqual({ offerSequence: 13, invoiceSequence: 42 })
  })
  it('erzeugt bei Wiederholung kein zweites Angebot und überschreibt keine Preise im bestehenden Entwurf', async () => {
    const first = await createMeasurementOffer(measurement)
    state.docs.set('invoice/offers/aufmass_m1', { offerNumber: first.number, totalAmount: 250 })
    const writes = state.writes
    expect(await createMeasurementOffer(measurement)).toEqual(first)
    expect(state.writes).toBe(writes)
    expect(state.docs.get('invoice/offers/aufmass_m1')?.totalAmount).toBe(250)
  })
  it('blockiert ungeprüfte Texte und fehlende Mengen vor dem Schreiben', async () => {
    await expect(createMeasurementOffer({ ...measurement, text: 'geändert' })).rejects.toThrow('erneut ableiten')
    await expect(createMeasurementOffer({ ...measurement, positions: [{ ...measurement.positions[0], quantity: null }] })).rejects.toThrow('positive Menge')
    expect(state.writes).toBe(0)
  })
  it('verbraucht bei fehlendem Kunden keine Angebotsnummer', async () => {
    await expect(createMeasurementOffer({ ...measurement, customerId: 'nicht-vorhanden' })).rejects.toThrow('existiert nicht mehr')
    expect(state.writes).toBe(0)
  })
})

it('legt neue Kunden direkt im gemeinsamen Kundenstamm an und bleibt bei Wiederholung idempotent', async () => {
  const customer = { id: 'new', name: ' Müller ', street: 'Musterweg 7', zipCode: '91792', city: 'Ellingen', email: 'info@example.test', phone: '123' }
  await createMeasurementCustomer(customer)
  await createMeasurementCustomer(customer)
  expect(state.writes).toBe(1)
  expect(state.docs.get('invoice/customers/new')).toMatchObject({ name: 'Müller', address: { street: 'Musterweg 7', city: 'Ellingen', country: 'Deutschland' }, contact: { email: 'info@example.test' }, isActive: true })
})
