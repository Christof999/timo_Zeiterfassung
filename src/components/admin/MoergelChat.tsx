import { useEffect, useRef, useState } from 'react'
import {
  runAgentTurn,
  transcribeAudio,
  type GeminiContent
} from '../../services/agentService'
import '../../styles/MoergelChat.css'

interface MoergelChatProps {
  admin: { id?: string; name?: string }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface PendingConfirm {
  summary: string
  resolve: (ok: boolean) => void
}

const MoergelChat: React.FC<MoergelChatProps> = ({ admin }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hallo, ich bin Mörgel 👋 Sag mir z. B.: „Buche den letzten Zeiteintrag von Lukas auf Projekt Musterstraße um." oder „Trage 12 m² Fliesen beim letzten Eintrag von Anna ein." Du kannst auch auf das Mikrofon tippen und es mir sagen.'
    }
  ])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const contentsRef = useRef<GeminiContent[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, pendingConfirm])

  const confirmMutation = (summary: string): Promise<boolean> =>
    new Promise((resolve) => setPendingConfirm({ summary, resolve }))

  const resolvePending = (ok: boolean) => {
    pendingConfirm?.resolve(ok)
    setPendingConfirm(null)
  }

  const sendText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    contentsRef.current.push({ role: 'user', parts: [{ text: trimmed }] })
    setIsBusy(true)
    try {
      const { reply, contents } = await runAgentTurn(contentsRef.current, admin, {
        confirmMutation,
        onStatus: setStatus
      })
      contentsRef.current = contents
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `⚠️ Fehler: ${error?.message || 'Unbekannter Fehler'}` }
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

  // --- Sprachaufnahme -------------------------------------------------
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
        { role: 'assistant', text: '⚠️ Kein Zugriff aufs Mikrofon. Bitte Berechtigung erlauben.' }
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
          { role: 'assistant', text: 'Ich habe leider nichts verstanden – bitte nochmal.' }
        ])
      }
    } catch (error: any) {
      setStatus(null)
      setIsBusy(false)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `⚠️ Transkription fehlgeschlagen: ${error?.message || ''}` }
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
                <small>KI-Assistent</small>
              </div>
            </div>
            <button className="moergel-close" onClick={() => setIsOpen(false)} aria-label="Schließen">
              ×
            </button>
          </div>

          <div className="moergel-messages">
            {messages.map((m, i) => (
              <div key={i} className={`moergel-msg moergel-msg-${m.role}`}>
                {m.text}
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
