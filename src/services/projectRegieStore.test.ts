import { beforeEach, expect, it, vi } from 'vitest'
const { getDoc, getDocs, updateDoc } = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn(), updateDoc: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  query: (name: string) => name,
  where: vi.fn(), getDoc, getDocs, updateDoc
}))
import type { Firestore } from 'firebase/firestore'
import { correctProjectRegie, loadProjectRegie } from './projectRegieStore'
import { quantityFingerprint } from '../utils/projectRegie'

const db = {} as Firestore
const entry = { employeeId: 'e', clockInTime: new Date(2026, 10, 1, 8), clockOutTime: new Date(2026, 10, 1, 10) }
beforeEach(() => {
  vi.clearAllMocks()
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Bad' }) })
  getDocs.mockImplementation(async (name: string) => ({ docs: name === 'timeEntries' ? [{ id: 'entry', data: () => entry }] : [] }))
  updateDoc.mockResolvedValue(undefined)
})

it('speichert ausschließlich die ausdrücklich bestätigte Mengenkorrektur am Projekt', async () => {
  const report = await loadProjectRegie(db, 'project')
  const corrected = await correctProjectRegie(db, report, [{ articleId: 'labor', description: 'Lohn', quantity: 3, unit: 'h' }])
  expect(corrected.quantities[0].quantity).toBe(3)
  expect(updateDoc).toHaveBeenCalledExactlyOnceWith('projects/project', {
    regieQuantityCorrection: { sourceFingerprint: quantityFingerprint(report.sourceQuantities), quantities: [{ key: 'labor:h', name: 'Arbeitszeit', quantity: 3, unit: 'h' }], updatedAt: expect.any(Date) }
  })
  expect(corrected.days[0].hours).toBe(2)
})

it('verhindert eine Korrektur bei zwischenzeitlich veränderten Buchungsmengen', async () => {
  const report = await loadProjectRegie(db, 'project')
  getDocs.mockImplementation(async (name: string) => ({ docs: name === 'timeEntries' ? [{ id: 'entry', data: () => ({ ...entry, clockOutTime: new Date(2026, 10, 1, 11) }) }] : [] }))
  await expect(correctProjectRegie(db, report, [])).rejects.toThrow('Projektbuchungen wurden geändert')
  expect(updateDoc).not.toHaveBeenCalled()
})

it('meldet fehlgeschlagene Datenzugriffe statt einen unvollständigen Bericht zu erzeugen', async () => {
  getDocs.mockRejectedValue(new Error('permission-denied'))
  await expect(loadProjectRegie(db, 'project')).rejects.toThrow('permission-denied')
  expect(updateDoc).not.toHaveBeenCalled()
})
