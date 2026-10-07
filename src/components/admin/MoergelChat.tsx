import { useEffect, useRef, useState } from 'react'
import {
  runAgentTurn,
  transcribeAudio,
  type GeminiContent
} from '../../services/agentService'
import {
  chatOriginLabel,
  deleteMoergelChat,
  fingerprintMessages,
  getActiveConversationId,
  mergeChatMessages,
  messageText,
  saveMoergelChat,
  setActiveConversationId,
  subscribeMoergelChats,
  toGeminiTurns,
  type MoergelConversation,
  type MoergelStoredMessage
} from '../../services/moergelConversationService'
import '../../styles/MoergelChat.css'

interface MoergelChatProps {
  admin: { id?: string; name?: string; username?: string }
}

interface PendingConfirm {
  summary: string
  resolve: (ok: boolean) => void
}

const GREETING =
  'Hallo, ich bin Mörgel 👋 Sag mir z. B.: „Buche den letzten Zeiteintrag von Lukas auf Projekt Musterstraße um." oder „Trage 12 m² Fliesen beim letzten Eintrag von Anna ein." Du kannst auch auf das Mikrofon tippen und es mir sagen.'

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
}

function greetingMessage(): MoergelStoredMessage {
  return {
    id: newId(),
    role: 'assistant',
    content: GREETING,
    timestamp: new Date().toISOString(),
    sourceApp: 'zeit'
  }
}

const MoergelChat: React.FC<MoergelChatProps> = ({ admin }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<MoergelStoredMessage[]>([])
  const [conversations, setConversations] = useState<MoergelConversation[]>([])
  const [showList, setShowList] = useState(false)
  const [conversationId, setConversationId] = useState('')
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const messagesRef = useRef<MoergelStoredMessage[]>([])
  const conversationIdRef = useRef('')
  const lastApplied = useRef('')
  const hydrated = useRef(false)
  const isBusyRef = useRef(false)
  const adminRef = useRef(admin)
  adminRef.current = admin
  const ownerKey = `${admin.username || ''}|${admin.name || ''}`

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])
  useEffect(() => {
    isBusyRef.current = isBusy
  }, [isBusy])

  useEffect(() => {
    hydrated.current = false
    return subscribeMoergelChats(adminRef.current, (list) => {
      setConversations(list)
      const openId = conversationIdRef.current
      if (!hydrated.current) {
        hydrated.current = true
        const activeId = getActiveConversationId()
        const active = activeId ? list.find((item) => item.id === activeId) : undefined
        const chosen = active && active.messages.some((message) => message.role === 'user') ? active : list[0]
        if (chosen && chosen.messages.some((message) => message.role === 'user')) {
          lastApplied.current = fingerprintMessages(chosen.messages)
          setConversationId(chosen.id)
          setMessages(chosen.messages)
          return
        }
        const id = newId()
        const greeting = [greetingMessage()]
        lastApplied.current = fingerprintMessages(greeting)
        setConversationId(id)
        setActiveConversationId(id)
        setMessages(greeting)
        return
      }
      if (!openId || isBusyRef.current) return
      const remote = list.find((item) => item.id === openId)
      if (!remote) return
      const merged = mergeChatMessages(messagesRef.current, remote.messages)
      const key = fingerprintMessages(merged)
      if (key === lastApplied.current) return
      lastApplied.current = key
      setMessages(merged)
    })
  }, [ownerKey])

  useEffect(() => {
    if (!conversationId) return
    if (!messages.some((message) => message.role === 'user' && messageText(message))) return
    const key = fingerprintMessages(messages)
    if (key === lastApplied.current) return
    lastApplied.current = key
    saveMoergelChat(adminRef.current, conversationId, messages).catch((error) =>
      console.error('Mörgel-Chat konnte nicht gespeichert werden:', error)
    )
  }, [messages, conversationId, ownerKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, pendingConfirm])

  const confirmMutation = (summary: string): Promise<boolean> =>
    new Promise((resolve) => setPendingConfirm({ summary, resolve }))

  const resolvePending = (ok: boolean) => {
    pendingConfirm?.resolve(ok)
    setPendingConfirm(null)
  }

  const startNewChat = () => {
    const id = newId()
    const greeting = [greetingMessage()]
    lastApplied.current = fingerprintMessages(greeting)
    setConversationId(id)
    setActiveConversationId(id)
    setMessages(greeting)
    setShowList(false)
  }

  const openChat = (conversation: MoergelConversation) => {
    lastApplied.current = fingerprintMessages(conversation.messages)
    setConversationId(conversation.id)
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages)
    setShowList(false)
  }

  const removeChat = async (id: string) => {
    if (!confirm('Diesen Chat wirklich löschen?')) return
    await deleteMoergelChat(id)
    if (id === conversationIdRef.current) startNewChat()
  }

  const sendText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    setInput('')
    const history = [
      ...messagesRef.current,
      {
        id: newId(),
        role: 'user' as const,
        content: trimmed,
        timestamp: new Date().toISOString(),
        sourceApp: 'zeit' as const
      }
    ]
    setMessages(history)
    setIsBusy(true)
    try {
      const contents: GeminiContent[] = toGeminiTurns(history)
      const { reply } = await runAgentTurn(contents, admin, {
        confirmMutation,
        onStatus: setStatus
      })
      setMessages([
        ...history,
        {
          id: newId(),
          role: 'assistant',
          content: reply,
          timestamp: new Date().toISOString(),
          sourceApp: 'zeit'
        }
      ])
    } catch (error: any) {
      setMessages([
        ...history,
        {
          id: newId(),
          role: 'assistant',
          content: `⚠️ Fehler: ${error?.message || 'Unbekannter Fehler'}`,
          timestamp: new Date().toISOString(),
          sourceApp: 'zeit'
        }
      ])
    } finally {
      setStatus(null)
      setIsBusy(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendText(input)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
        await handleTranscription(blob, recorder.mimeType)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: '⚠️ Kein Zugriff aufs Mikrofon. Bitte Berechtigung erlauben.',
          timestamp: new Date().toISOString(),
          sourceApp: 'zeit'
        }
      ])
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const handleTranscription = async (blob: Blob, mimeType: string) => {
    setStatus('hört zu …')
    setIsBusy(true)
    try {
      const base64 = await blobToBase64(blob)
      const text = await transcribeAudio(base64, mimeType.split(';')[0] || 'audio/webm')
      setStatus(null)
      setIsBusy(false)
      if (text) {
        setInput(text)
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            content: 'Ich habe leider nichts verstanden – bitte nochmal.',
            timestamp: new Date().toISOString(),
            sourceApp: 'zeit'
          }
        ])
      }
    } catch (error: any) {
      setStatus(null)
      setIsBusy(false)
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: `⚠️ Transkription fehlgeschlagen: ${error?.message || ''}`,
          timestamp: new Date().toISOString(),
          sourceApp: 'zeit'
        }
      ])
    }
  }

  return (
    <>
      <button
        className="moergel-fab"
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Mörgel öffnen"
        title="Mörgel – KI-Assistent"
      >
        {isOpen ? '×' : '💬'}
      </button>

      {isOpen && (
        <div className="moergel-panel" role="dialog" aria-label="Mörgel Chat">
          <div className="moergel-header">
            <div className="moergel-header-title">
              <span className="moergel-avatar">🤖</span>
              <div>
                <strong>Mörgel</strong>
                <small>Chats aus beiden Programmen</small>
              </div>
            </div>
            <div className="moergel-header-actions">
              <button className="moergel-icon" onClick={startNewChat} aria-label="Neuer Chat" title="Neuer Chat">
                +
              </button>
              <button
                className="moergel-icon"
                onClick={() => setShowList((open) => !open)}
                aria-label="Chatliste"
                title="Chats"
              >
                ≡
              </button>
              <button className="moergel-close" onClick={() => setIsOpen(false)} aria-label="Schließen">
                ×
              </button>
            </div>
          </div>

          {showList ? (
            <div className="moergel-list">
              {conversations.length === 0 ? (
                <p className="moergel-list-empty">Noch keine gespeicherten Chats.</p>
              ) : (
                conversations.map((conversation) => (
                  <div key={conversation.id} className="moergel-list-row">
                    <button className="moergel-list-item" onClick={() => openChat(conversation)}>
                      <strong>{conversation.title || 'Neuer Chat'}</strong>
                      <small>
                        {conversation.updatedAt.toLocaleDateString('de-DE')}
                        {chatOriginLabel(conversation.sourceApp)
                          ? ` · ${chatOriginLabel(conversation.sourceApp)}`
                          : ''}
                      </small>
                    </button>
                    <button
                      className="moergel-list-delete"
                      onClick={() => removeChat(conversation.id)}
                      aria-label="Chat löschen"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="moergel-messages">
              {messages.map((m) => (
                <div key={m.id} className={`moergel-msg moergel-msg-${m.role === 'user' ? 'user' : 'assistant'}`}>
                  {messageText(m)}
                </div>
              ))}

              {status && <div className="moergel-status">{status}</div>}

              {pendingConfirm && (
                <div className="moergel-confirm">
                  <div className="moergel-confirm-summary">{pendingConfirm.summary}</div>
                  <div className="moergel-confirm-actions">
                    <button className="moergel-btn-confirm" onClick={() => resolvePending(true)}>
                      Ja, ausführen
                    </button>
                    <button className="moergel-btn-cancel" onClick={() => resolvePending(false)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          <form className="moergel-input-row" onSubmit={handleSubmit}>
            <button
              type="button"
              className={`moergel-mic ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isBusy && !isRecording}
              aria-label={isRecording ? 'Aufnahme stoppen' : 'Sprachnachricht aufnehmen'}
              title={isRecording ? 'Aufnahme stoppen' : 'Sprachnachricht'}
            >
              {isRecording ? '⏹' : '🎤'}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? 'Aufnahme läuft …' : 'Nachricht an Mörgel …'}
              disabled={isBusy}
            />
            <button type="submit" className="moergel-send" disabled={isBusy || !input.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default MoergelChat
