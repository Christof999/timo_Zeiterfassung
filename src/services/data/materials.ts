import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { db } from '../firebaseConfig'
import type { MaterialCredit, MaterialType } from '../../types'
import { authReady, convertToDate } from './shared'

export async function getActiveMaterialTypes(): Promise<MaterialType[]> {
  await authReady
  try {
    const ref = collection(db, 'materialTypes')
    const snapshot = await getDocs(ref)
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialType))
    return list
      .filter((m) => m.isActive !== false && (m.name || '').trim())
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.name || '').localeCompare(b.name || '', 'de'))
  } catch (error) {
    console.error('Fehler beim Abrufen der Materialtypen:', error)
    return []
  }
}

export async function getAllMaterialTypes(): Promise<MaterialType[]> {
  await authReady
  try {
    const ref = collection(db, 'materialTypes')
    const snapshot = await getDocs(ref)
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as MaterialType))
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.name || '').localeCompare(b.name || '', 'de'))
  } catch (error) {
    console.error('Fehler beim Abrufen der Materialtypen:', error)
    return []
  }
}

export async function createMaterialType(data: Partial<MaterialType>): Promise<string> {
  await authReady
  const ref = collection(db, 'materialTypes')
  const payload: Record<string, unknown> = {
    name: data.name || '',
    unitLabel: data.unitLabel || 'm²',
    unitPriceEur: typeof data.unitPriceEur === 'number' ? data.unitPriceEur : undefined,
    purchasePriceEur: typeof data.purchasePriceEur === 'number' ? data.purchasePriceEur : undefined,
    isActive: data.isActive !== false,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    createdAt: new Date()
  }
  // Firestore lehnt undefined-Felder ab (z. B. wenn kein Ein-/Verkaufspreis gesetzt)
  const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  const docRef = await addDoc(ref, cleaned)
  return docRef.id
}

export async function updateMaterialType(id: string, data: Partial<MaterialType>): Promise<void> {
  await authReady
  await updateDoc(doc(db, 'materialTypes', id), {
    ...data,
    updatedAt: new Date()
  })
}

export async function deleteMaterialType(id: string): Promise<void> {
  await authReady
  await deleteDoc(doc(db, 'materialTypes', id))
}

/**
 * Löscht Materialarten. Ohne Filter werden alle gelöscht; mit
 * { onlyHero: true } nur die aus HERO importierten Artikel.
 * Liefert die Anzahl gelöschter Einträge.
 */
export async function deleteAllMaterialTypes(options?: { onlyHero?: boolean }): Promise<number> {
  await authReady
  const snapshot = await getDocs(collection(db, 'materialTypes'))
  const docs = snapshot.docs.filter((d) =>
    options?.onlyHero ? (d.data() as MaterialType).source === 'hero' : true
  )
  let batch = writeBatch(db)
  let inBatch = 0
  let deleted = 0
  for (const d of docs) {
    batch.delete(d.ref)
    inBatch += 1
    deleted += 1
    if (inBatch >= 450) {
      await batch.commit()
      batch = writeBatch(db)
      inBatch = 0
    }
  }
  if (inBatch > 0) {
    await batch.commit()
  }
  return deleted
}

// ==================== MATERIAL-GUTSCHRIFTEN ====================

/** Alle Gutschriften einer Baustelle (neueste zuerst). */
export async function getMaterialCreditsByProject(projectId: string): Promise<MaterialCredit[]> {
  await authReady
  try {
    const ref = collection(db, 'materialCredits')
    const q = query(ref, where('projectId', '==', projectId))
    const snapshot = await getDocs(q)
    const list = snapshot.docs.map((d) => {
      const data = d.data()
      const createdAt =
        data.createdAt instanceof Timestamp
          ? data.createdAt.toDate()
          : data.createdAt?.toDate?.() || data.createdAt || new Date()
      return { id: d.id, ...data, createdAt } as MaterialCredit
    })
    return list.sort((a, b) => convertToDate(b.createdAt).getTime() - convertToDate(a.createdAt).getTime())
  } catch (error) {
    console.error('Fehler beim Abrufen der Material-Gutschriften:', error)
    return []
  }
}

/** Eine Material-Gutschrift erfassen. */
export async function addMaterialCredit(data: Partial<MaterialCredit>): Promise<MaterialCredit> {
  await authReady
  const ref = collection(db, 'materialCredits')
  const payload: Record<string, unknown> = {
    projectId: data.projectId || '',
    kind: data.kind === 'consumption' ? 'consumption' : 'credit',
    employeeId: data.employeeId,
    employeeName: data.employeeName,
    materialTypeId: data.materialTypeId,
    materialName: data.materialName || '',
    unitLabel: data.unitLabel,
    quantity: typeof data.quantity === 'number' ? data.quantity : 0,
    unitPriceEur: typeof data.unitPriceEur === 'number' ? data.unitPriceEur : undefined,
    note: data.note,
    createdAt: serverTimestamp()
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  const docRef = await addDoc(ref, clean)
  return { id: docRef.id, ...data, createdAt: new Date() } as MaterialCredit
}

/** Eine Material-Gutschrift löschen. */
export async function deleteMaterialCredit(id: string): Promise<void> {
  await authReady
  await deleteDoc(doc(db, 'materialCredits', id))
}
