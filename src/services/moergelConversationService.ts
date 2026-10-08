import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from './firebaseConfig'
import { authReady } from './data/shared'

/**
 * Dieselben Mörgel-Chats wie im Rechnungsprogramm.
 * Schema muss mit Timo_Rechnungsprogramm/src/services/assistantConversationService.ts
 * übereinstimmen: Sammlung `moergelChats` in der Zeiterfassungs-Datenbank.
 * aliases sind kleingeschriebene Namen, damit „Timo“ und „Timo Reislöhner“
 * denselben Chat finden.
 */

const COLLECTION = 'moergelChats'
const ACTIVE_KEY = 'moergel_active_conversation'
const THIS_APP = 'zeit'

export interface ChatOwner {
  username?: string
  name?: string
}

export interface MoergelStoredMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  sourceApp?: 'rechnung' | 'zeit'
  pending?: boolean
  actionStatus?: string
  toolSteps?: { name: string; success: boolean }[]
  [key: string]: unknown
}

export interface MoergelConversation {
  id: string
  title: string
  messages: MoergelStoredMessage[]
  createdAt: Date
  updatedAt: Date
  sourceApp?: 'rechnung' | 'zeit'
}

export function chatOwnerAliases(username?: string | null, displayName?: string | null): string[] {
  const out = new Set<string>()
  const add = (value?: string | null) => {
    const trimmed = (value || '').trim().toLowerCase()
    if (trimmed.length >= 2) out.add(trimmed)
  }
  add(username)
  add(displayName)
  const first = (displayName || '').trim().split(/\s+/)[0]
  if (first && first.toLowerCase() !== (displayName || '').trim().toLowerCase()) add(first)
  return [...out]
}

export function chatOriginLabel(sourceApp?: string): string {
  if (sourceApp === 'zeit') return 'Zeiterfassung'
  if (sourceApp === 'rechnung') return 'Rechnungsprogramm'
  return ''
}

function aliasesOf(owner: ChatOwner): string[] {
  return chatOwnerAliases(owner.username, owner.name)
}

function revive(json: unknown): MoergelStoredMessage[] {
  if (typeof json !== 'string') return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((message) => message && typeof message === 'object')
      .map((message) => {
        const timestamp = message.timestamp
        return {
          ...message,
          id: String(message.id || ''),
          role: message.role === 'user' || message.role === 'system' ? message.role : 'assistant',
          content: typeof message.content === 'string' ? message.content : '',
          timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        }
      })
  } catch {
    return []
  }
}

function toDoc(id: string, data: Record<string, unknown>): MoergelConversation {
  const source = data.sourceApp === 'zeit' || data.sourceApp === 'rechnung' ? data.sourceApp : undefined
  const created = data.createdAt as { toDate?: () => Date } | undefined
  const updated = data.updatedAt as { toDate?: () => Date } | undefined
  return {
    id,
    title: typeof data.title === 'string' && data.title ? data.title : 'Neuer Chat',
    messages: revive(data.messagesJson),
    createdAt: created?.toDate?.() || new Date(),
    updatedAt: updated?.toDate?.() || new Date(),
    sourceApp: source,
  }
}

export function messageText(message: { content?: string; text?: string }): string {
  return (message.content || message.text || '').trim()
}

export function toGeminiTurns(
  messages: MoergelStoredMessage[]
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ message, text: messageText(message) }))
    .filter(({ text }) => text.length > 0)
    .filter(({ text }) => !text.includes('Was kann ich für dich tun?') && !text.includes('Sag mir z. B.'))
    .map(({ message, text }) => ({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text }],
    }))
}

function storable(messages: MoergelStoredMessage[]): MoergelStoredMessage[] {
  return messages
    .filter((message) => !message.pending && message.actionStatus !== 'pending')
    .map((message) => {
      const copy = { ...message }
      delete copy.image
      delete copy.pending
      copy.sourceApp = message.sourceApp === 'rechnung' || message.sourceApp === 'zeit' ? message.sourceApp : THIS_APP
      return copy
    })
}

export function fingerprintMessages(messages: MoergelStoredMessage[]): string {
  return JSON.stringify(storable(messages))
}

export function mergeChatMessages(
  local: MoergelStoredMessage[],
  remote: MoergelStoredMessage[]
): MoergelStoredMessage[] {
  const byId = new Map<string, MoergelStoredMessage>()
  for (const message of remote) byId.set(message.id, message)
  for (const message of local) {
    if (message.pending || message.actionStatus === 'pending' || !byId.has(message.id)) {
      byId.set(message.id, message)
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

function titleFrom(messages: MoergelStoredMessage[]): string {
  const first = messages.find((message) => message.role === 'user' && messageText(message))
  if (!first) return 'Neuer Chat'
  const text = messageText(first).replace(/\s+/g, ' ')
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

export function getActiveConversationId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveConversationId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

export async function saveMoergelChat(
  owner: ChatOwner,
  id: string,
  messages: MoergelStoredMessage[]
): Promise<void> {
  if (!messages.some((message) => message.role === 'user' && messageText(message))) return
  await authReady
  const ref = doc(db, COLLECTION, id)
  const now = Timestamp.now()
  let created = now
  let aliases = aliasesOf(owner)
  let title = titleFrom(messages)
  const existing = await getDoc(ref)
  if (existing.exists()) {
    const data = existing.data()
    if (data.createdAt) created = data.createdAt
    if (Array.isArray(data.aliases)) {
      aliases = [...new Set([...data.aliases.map((alias: unknown) => String(alias)), ...aliases])]
    }
    if (typeof data.title === 'string' && data.title && data.title !== 'Neuer Chat') title = data.title
  }
  await setDoc(ref, {
    aliases,
    user: owner.name || owner.username || 'unbekannt',
    title,
    messagesJson: JSON.stringify(storable(messages)),
    sourceApp: THIS_APP,
    createdAt: created,
    updatedAt: now,
  })
  setActiveConversationId(id)
}

export async function deleteMoergelChat(id: string): Promise<void> {
  await authReady
  await deleteDoc(doc(db, COLLECTION, id))
  if (getActiveConversationId() === id) localStorage.removeItem(ACTIVE_KEY)
}

export function subscribeMoergelChats(
  owner: ChatOwner,
  onChange: (list: MoergelConversation[]) => void
): () => void {
  const aliases = aliasesOf(owner)
  const state = { cancelled: false, unsubs: [] as Array<() => void> }
  if (aliases.length === 0) {
    onChange([])
    return () => {}
  }
  ;(async () => {
    await authReady
    if (state.cancelled) return
    const buckets = new Map<string, MoergelConversation[]>()
    const waiting = new Set(aliases)
    const emit = () => {
      if (waiting.size > 0) return
      const map = new Map<string, MoergelConversation>()
      for (const list of buckets.values()) {
        for (const conversation of list) map.set(conversation.id, conversation)
      }
      onChange([...map.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
    }
    for (const alias of aliases) {
      const unsub = onSnapshot(
        query(collection(db, COLLECTION), where('aliases', 'array-contains', alias)),
        (snapshot) => {
          waiting.delete(alias)
          buckets.set(
            alias,
            snapshot.docs.map((item) => toDoc(item.id, item.data() as Record<string, unknown>))
          )
          emit()
        },
        (error) => {
          waiting.delete(alias)
          console.error('Mörgel-Chats: Live-Update fehlgeschlagen:', error)
          emit()
        }
      )
      if (state.cancelled) {
        unsub()
        return
      }
      state.unsubs.push(unsub)
    }
  })()
  return () => {
    state.cancelled = true
    state.unsubs.forEach((unsub) => unsub())
  }
}
