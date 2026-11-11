import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const nodeRequire = createRequire(import.meta.url)
function setup({ cached = false, denied = false, failed = false } = {}) {
  const docs = new Map<string, Record<string, unknown>>()
  const ref = (id: string) => ({ id, get: async () => ({ data: () => docs.get(id) }), set: async (value: Record<string, unknown>) => { docs.set(id, value) } })
  const db = {
    collection: () => ({ doc: ref }),
    runTransaction: async (fn: (tx: unknown) => unknown) => fn({
      get: async (doc: { id: string }) => ({ data: () => cached && doc.id !== 'lock' ? { address: 'Adresse aus Cache', expiresAt: new Date(Date.now() + 10000) } : docs.get(doc.id) }),
      set: (doc: { id: string }, value: Record<string, unknown>) => docs.set(doc.id, value)
    })
  }
  const fetch = vi.fn().mockResolvedValue({ ok: !failed, status: failed ? 503 : 200, headers: { get: () => null }, json: async () => ({ address: { road: 'Musterstraße', house_number: '7', postcode: '80331', city: 'München' } }) })
  const module = { exports: async (_req: unknown, _res: unknown) => {} }
  runInNewContext(readFileSync('api/geocode.js', 'utf8'), {
    module, Date, URL, Number, Math, Promise, setTimeout, AbortSignal, process: { env: {} }, fetch,
    require: (name: string) => name === 'firebase-admin/app' ? { getApps: () => [{}] }
      : name === 'firebase-admin/auth' ? { getAuth: () => ({ verifyIdToken: async () => { if (denied) throw new Error('invalid') } }) }
      : name === 'firebase-admin/firestore' ? { getFirestore: () => db } : nodeRequire(name)
  })
  const call = async (body: unknown, headers = { authorization: 'Bearer test' }, method = 'POST') => {
    let status = 0, payload: unknown
    const res = { status: (value: number) => { status = value; return res }, json: (value: unknown) => { payload = value } }
    await module.exports({ method, headers, body }, res)
    return { status, payload }
  }
  return { call, fetch, docs }
}

it('erfordert Anmeldung und POST', async () => {
  const { call, fetch } = setup()
  expect((await call({}, { authorization: '' })).status).toBe(401)
  expect((await call({}, undefined, 'GET')).status).toBe(405)
  expect(fetch).not.toHaveBeenCalled()
})
it('weist ungültige Tokens und Koordinaten ab', async () => {
  expect((await setup({ denied: true }).call({ lat: 48, lng: 11 })).status).toBe(401)
  const { call, fetch } = setup()
  for (const body of [null, [], {}, { lat: 91, lng: 11 }, { lat: 48, lng: '11' }]) expect((await call(body)).status).toBe(422)
  expect(fetch).not.toHaveBeenCalled()
})
it('verwendet den Cache ohne externe Anfrage', async () => {
  const { call, fetch } = setup({ cached: true })
  expect(await call({ lat: 48, lng: 11 })).toEqual({ status: 200, payload: { address: 'Adresse aus Cache' } })
  expect(fetch).not.toHaveBeenCalled()
})
it('liefert die Adresse und speichert nur Adresse und Ablaufdatum', async () => {
  const { call, docs } = setup()
  expect(await call({ lat: 48, lng: 11 })).toEqual({ status: 200, payload: { address: 'Musterstraße 7, 80331 München' } })
  const cached = [...docs.entries()].find(([id]) => id !== 'lock')![1]
  expect(Object.keys(cached).sort()).toEqual(['address', 'expiresAt'])
  expect(docs.get('lock')?.owner).toBeNull()
})
it('gibt die Sperre bei Ausfall mit Abkühlzeit frei', async () => {
  const { call, docs } = setup({ failed: true })
  expect((await call({ lat: 48, lng: 11 })).status).toBe(503)
  expect(docs.get('lock')?.owner).toBeNull()
  expect(Number(docs.get('lock')?.availableAt)).toBeGreaterThan(Date.now() + 59000)
})
