import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { db } from './firebaseConfig'
import { authReady } from './data/shared'

/** Voreingestellter Empfänger, solange nichts gepflegt wurde. */
export const DEFAULT_REPORT_RECIPIENT = 'christof.didi@googlemail.com'

const CONFIG_DOC = { collection: 'integrations', id: 'reportEmail' }

export interface ReportMailConfig {
  /** Empfängeradresse für den Zeiterfassungsbericht */
  recipient: string
  updatedAt?: Date | any
}

export const isValidEmail = (value: string): boolean =>
  /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test((value || '').trim())

export async function getReportMailConfig(): Promise<ReportMailConfig> {
  await authReady
  try {
    const snap = await getDoc(doc(db, CONFIG_DOC.collection, CONFIG_DOC.id))
    const recipient = snap.exists() ? (snap.data() as ReportMailConfig).recipient : ''
    return { recipient: recipient || DEFAULT_REPORT_RECIPIENT }
  } catch (error) {
    console.error('Fehler beim Laden des Mail-Empfängers:', error)
    return { recipient: DEFAULT_REPORT_RECIPIENT }
  }
}

export async function saveReportMailRecipient(recipient: string): Promise<void> {
  await authReady
  const trimmed = (recipient || '').trim()
  if (!isValidEmail(trimmed)) throw new Error('Bitte eine gültige E-Mail-Adresse angeben.')
  await setDoc(
    doc(db, CONFIG_DOC.collection, CONFIG_DOC.id),
    { recipient: trimmed, updatedAt: new Date() },
    { merge: true }
  )
}

export interface SendReportMailInput {
  to: string
  employeeName: string
  periodLabel: string
  totalHours: string
  grossWage: string
  note?: string
  senderName?: string
  /** Vollständiges Druck-HTML des Berichts – wird als Datei angehängt. */
  reportHtml: string
  attachmentFilename?: string
  /** true = nur rendern, es geht nichts raus */
  dryRun?: boolean
}

/**
 * Schickt den Bericht über die eigene Function `/api/send-report`. Der
 * Email-Proxy-Key liegt ausschließlich dort — im Browser-Bundle wäre er
 * für jeden lesbar.
 */
export async function sendReportMail(input: SendReportMailInput): Promise<void> {
  const user = getAuth().currentUser
  if (!user) throw new Error('Nicht angemeldet.')
  const idToken = await user.getIdToken()

  const response = await fetch('/api/send-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(input)
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result?.error || 'Der Bericht konnte nicht versendet werden.')
  }
}
