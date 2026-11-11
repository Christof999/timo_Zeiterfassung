import { collection, doc, getDoc, getDocs, query, updateDoc, where, type Firestore } from 'firebase/firestore'
import { buildProjectRegie, invoiceRegieQuantities, quantityFingerprint, type ProjectRegie, type RegieInvoiceLine } from '../utils/projectRegie'

export async function loadProjectRegie(db: Firestore, projectId: string): Promise<ProjectRegie> {
  const [project, entries, employees, credits, signatures] = await Promise.all([
    getDoc(doc(db, 'projects', projectId)),
    getDocs(query(collection(db, 'timeEntries'), where('projectId', '==', projectId))),
    getDocs(collection(db, 'employees')),
    getDocs(query(collection(db, 'materialCredits'), where('projectId', '==', projectId))),
    getDocs(query(collection(db, 'regieSignatures'), where('projectId', '==', projectId)))
  ])
  if (!project.exists()) throw new Error('Projekt nicht gefunden.')
  const data = (snapshot: typeof entries) => snapshot.docs.map((d) => ({ ...d.data(), id: d.id }))
  return buildProjectRegie(projectId, project.data(), data(entries), data(employees), data(credits), data(signatures))
}

export async function correctProjectRegie(db: Firestore, report: ProjectRegie, lines: RegieInvoiceLine[]): Promise<ProjectRegie> {
  const latest = await loadProjectRegie(db, report.projectId)
  if (quantityFingerprint(latest.sourceQuantities) !== quantityFingerprint(report.sourceQuantities)) {
    throw new Error('Die Projektbuchungen wurden geändert. Bitte den Bericht neu laden.')
  }
  const quantities = invoiceRegieQuantities(lines, latest.sourceQuantities)
  await updateDoc(doc(db, 'projects', report.projectId), {
    regieQuantityCorrection: { sourceFingerprint: quantityFingerprint(latest.sourceQuantities), quantities, updatedAt: new Date() }
  })
  return { ...latest, quantities, corrected: true }
}
