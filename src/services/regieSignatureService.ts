import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from './firebaseConfig'
import { authReady, convertToDate } from './data/shared'

/**
 * Kundenunterschrift auf dem Regiezettel eines Projekttags.
 * Eine Unterschrift je Projekt und Kalendertag. Kommen danach weitere
 * Buchungen dazu, gilt sie nur noch für den Stand zum Unterschreiben.
 */
export interface StoredRegieSignature {
  projectId: string
  dateKey: string
  signatureDataUrl: string
  signerName: string
  signedAt: Date
  capturedByEmployeeId: string
  capturedByName: string
  signedEntryIds: string[]
  signedDayTotal: number
}

const COLLECTION = 'regieSignatures'

export const regieSignatureDocId = (projectId: string, dateKey: string): string =>
  `${projectId.replace(/\//g, '_')}_${dateKey}`

const fromDoc = (projectId: string, dateKey: string, data: Record<string, unknown>): StoredRegieSignature => ({
  projectId: (data.projectId as string) || projectId,
  dateKey: (data.dateKey as string) || dateKey,
  signatureDataUrl: typeof data.signatureDataUrl === 'string' ? data.signatureDataUrl : '',
  signerName: typeof data.signerName === 'string' ? data.signerName : '',
  signedAt: convertToDate(data.signedAt),
  capturedByEmployeeId: typeof data.capturedByEmployeeId === 'string' ? data.capturedByEmployeeId : '',
  capturedByName: typeof data.capturedByName === 'string' ? data.capturedByName : '',
  signedEntryIds: Array.isArray(data.signedEntryIds)
    ? data.signedEntryIds.filter((id): id is string => typeof id === 'string')
    : [],
  signedDayTotal: typeof data.signedDayTotal === 'number' && Number.isFinite(data.signedDayTotal) ? data.signedDayTotal : 0
})

export async function getRegieSignature(
  projectId: string,
  dateKey: string
): Promise<StoredRegieSignature | null> {
  await authReady
  const snap = await getDoc(doc(db, COLLECTION, regieSignatureDocId(projectId, dateKey)))
  if (!snap.exists()) return null
  return fromDoc(projectId, dateKey, snap.data() as Record<string, unknown>)
}

export async function getRegieSignaturesForProject(projectId: string): Promise<StoredRegieSignature[]> {
  await authReady
  const snap = await getDocs(query(collection(db, COLLECTION), where('projectId', '==', projectId)))
  return snap.docs.map((item) => {
    const data = item.data() as Record<string, unknown>
    const dateKey = typeof data.dateKey === 'string' ? data.dateKey : ''
    return fromDoc(projectId, dateKey, data)
  })
}

export async function saveRegieSignature(
  signature: Omit<StoredRegieSignature, 'signedAt'> & { signedAt?: Date }
): Promise<void> {
  await authReady
  await setDoc(doc(db, COLLECTION, regieSignatureDocId(signature.projectId, signature.dateKey)), {
    projectId: signature.projectId,
    dateKey: signature.dateKey,
    signatureDataUrl: signature.signatureDataUrl,
    signerName: signature.signerName.trim(),
    signedAt: signature.signedAt || new Date(),
    capturedByEmployeeId: signature.capturedByEmployeeId,
    capturedByName: signature.capturedByName,
    signedEntryIds: signature.signedEntryIds,
    signedDayTotal: signature.signedDayTotal
  })
}
