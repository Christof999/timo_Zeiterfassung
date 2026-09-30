import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes, uploadString } from 'firebase/storage'
import { db, storage } from '../firebaseConfig'
import type { Inspection } from '../../types/inspection'
import type { CatalogArticle } from '../../utils/articleMatch'
import { roomSummary } from '../../utils/roomGeometry'
import { authReady, convertToDate } from './shared'

const COLLECTION = 'inspections'

function fromDoc(id: string, data: Record<string, any>): Inspection {
  return {
    customerName: '',
    address: '',
    description: '',
    lvPositions: [],
    rooms: [],
    photos: [],
    visualizations: [],
    status: 'offen',
    ...data,
    id,
    createdAt: convertToDate(data.createdAt),
    updatedAt: convertToDate(data.updatedAt)
  } as Inspection
}

/** undefined kann Firestore nicht speichern – auch nicht in verschachtelten Objekten. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function listInspections(): Promise<Inspection[]> {
  await authReady
  const snapshot = await getDocs(collection(db, COLLECTION))
  return snapshot.docs
    .map((d) => fromDoc(d.id, d.data()))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function getInspection(id: string): Promise<Inspection | null> {
  await authReady
  const snapshot = await getDoc(doc(db, COLLECTION, id))
  return snapshot.exists() ? fromDoc(snapshot.id, snapshot.data()) : null
}

export async function createInspection(createdBy?: string): Promise<string> {
  await authReady
  const now = new Date()
  const ref = await addDoc(collection(db, COLLECTION), {
    customerName: '',
    address: '',
    description: '',
    lvPositions: [],
    rooms: [],
    photos: [],
    visualizations: [],
    status: 'offen',
    ...(createdBy ? { createdBy } : {}),
    createdAt: now,
    updatedAt: now
  })
  return ref.id
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  await authReady
  const { id, createdAt: _createdAt, ...rest } = inspection
  void _createdAt
  // Die Raumzusammenfassung mitspeichern: das Rechnungsprogramm liest sie, ohne
  // die Geometrie selbst nachrechnen zu müssen.
  await updateDoc(doc(db, COLLECTION, id), {
    ...clean(rest),
    roomSummaries: rest.rooms.map(roomSummary),
    updatedAt: new Date()
  })
}

export async function deleteInspection(inspection: Inspection): Promise<void> {
  await authReady
  const paths = [...inspection.photos, ...inspection.visualizations]
    .map((p) => p.storagePath)
    .filter((p): p is string => !!p)
  // Bilder zuerst: bleibt das Dokument übrig, lässt es sich erneut löschen.
  await Promise.all(paths.map((p) => deleteObject(storageRef(storage, p)).catch(() => undefined)))
  await deleteDoc(doc(db, COLLECTION, inspection.id))
}

/**
 * Speicherort der Bilder. Die Storage-Regeln erlauben Uploads nur unter
 * `uploads/{projekt}/{mitarbeiter}/{datei}` – die Besichtigung nimmt dort
 * den Platz des Projekts ein.
 */
function imagePath(inspectionId: string, uploader: string, name: string): string {
  const safeUploader = (uploader || 'admin').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `uploads/besichtigung_${inspectionId}/${safeUploader}/${Date.now()}_${name}`
}

export async function uploadInspectionImage(
  inspectionId: string,
  uploader: string,
  blob: Blob,
  name = 'foto.jpg'
): Promise<{ url: string; storagePath: string }> {
  await authReady
  const path = imagePath(inspectionId, uploader, name)
  const objectRef = storageRef(storage, path)
  await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' })
  return { url: await getDownloadURL(objectRef), storagePath: path }
}

export async function uploadInspectionDataUrl(
  inspectionId: string,
  uploader: string,
  dataUrl: string,
  name = 'visualisierung.png'
): Promise<{ url: string; storagePath: string }> {
  await authReady
  const path = imagePath(inspectionId, uploader, name)
  const objectRef = storageRef(storage, path)
  await uploadString(objectRef, dataUrl, 'data_url')
  return { url: await getDownloadURL(objectRef), storagePath: path }
}

export async function deleteInspectionImage(storagePath?: string): Promise<void> {
  if (!storagePath) return
  await authReady
  await deleteObject(storageRef(storage, storagePath)).catch(() => undefined)
}

/**
 * Der Artikelstamm fürs Leistungsverzeichnis. Er liegt in `materialTypes` und
 * wird vom Rechnungsprogramm gepflegt (Felder `unit`, `articleNumber`,
 * `parentId`); die Zeiterfassung selbst kennt davon nur Name und Einheit.
 * Variationen tragen den Namen des Hauptartikels vorne, sonst hieße eine
 * Variation nur „60 × 60“.
 */
export async function getArticleCatalog(): Promise<CatalogArticle[]> {
  await authReady
  const snapshot = await getDocs(collection(db, 'materialTypes'))
  const raw = snapshot.docs
    .map((d) => ({ ...(d.data() as Record<string, any>), id: d.id }) as Record<string, any>)
    .filter((m) => m.isActive !== false && String(m.name || '').trim())
  const nameById = new Map(raw.map((m) => [m.id, String(m.name).trim()]))
  return raw
    .map((m) => {
      const parentName = m.parentId ? nameById.get(m.parentId) : undefined
      const name = String(m.name).trim()
      return {
        id: m.id,
        name: parentName && !name.startsWith(parentName) ? `${parentName} – ${name}` : name,
        unit: String(m.unit || m.unitLabel || '').trim(),
        ...(m.articleNumber ? { articleNumber: String(m.articleNumber) } : {})
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
