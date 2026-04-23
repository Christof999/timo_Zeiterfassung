import React, { useState } from 'react'
import { ONBOARDING_STORAGE_KEY } from '../constants/onboarding'
import { APP_DISPLAY_NAME } from '../constants/appBranding'
import OnboardingDemoPreview, { type OnboardingDemoVariant } from './OnboardingDemoPreview'
import '../styles/OnboardingScreen.css'

type Slide = {
  title: string
  body: React.ReactNode
  bullets?: string[]
  preview: OnboardingDemoVariant
}

const slides: Slide[] = [
  {
    title: 'Willkommen',
    preview: 'welcome',
    body: (
      <>
        In wenigen Schritten zeigen wir dir die <strong>{APP_DISPLAY_NAME}</strong> – mit einer kleinen Vorschau, wie der Bildschirm später aussieht.
      </>
    ),
    bullets: ['Mit „Weiter“ gehst du Schritt für Schritt voran.', 'Du kannst die Tour jederzeit überspringen.']
  },
  {
    title: 'Anmeldung',
    preview: 'login',
    body: (
      <>
        Melde dich mit <strong>Benutzername</strong> und <strong>Passwort</strong> an. Dein Zugang legt der Administrator für dich an.
      </>
    ),
    bullets: ['Nach dem Login landest du direkt in der Zeiterfassung.']
  },
  {
    title: 'Einstempeln',
    preview: 'clockin',
    body: (
      <>
        Wähle deine <strong>aktuelle Baustelle</strong> aus der Liste und tippe auf <strong>Einstempeln</strong>.
      </>
    ),
    bullets: ['Es gibt nur eine aktive Stempelung gleichzeitig.', 'Die Projekte pflegt der Administrator.']
  },
  {
    title: 'Ausstempeln & Material',
    preview: 'clockout',
    body: (
      <>
        Beim <strong>Ausstempeln</strong> trägst du die <strong>Pause</strong> ein und den <strong>Materialverbrauch</strong> (z.&nbsp;B. Fliesen in m²).
      </>
    ),
    bullets: [
      'Materialarten und Preise legt der Administrator unter „Material“ fest.',
      'Wenn du heute kein Material verbucht hast: Häkchen bei „Kein Material“.',
      '„Einfach Ausstempeln“ speichert Zeit und Material; „Mit Dokumentation“ erlaubt zusätzlich Fotos und Notizen.'
    ]
  },
  {
    title: 'Dokumentation',
    preview: 'documentation',
    body: (
      <>
        Du kannst <strong>Fotos</strong> und <strong>Lieferscheine</strong> während der Arbeit ergänzen. Mit <strong>„Bericht nachtragen“</strong> füllst du bei abgeschlossenen Tagen noch etwas nach.
      </>
    ),
    bullets: ['Urlaubsanträge erreichst du über das Menü (☰).']
  },
  {
    title: 'Administration',
    preview: 'admin',
    body: (
      <>
        Im <strong>Admin-Bereich</strong> pflegst du <strong>Mitarbeiter</strong>, <strong>Projekte</strong>, <strong>Material</strong> (Einheit &amp; Preis) und die Auswertungen.
      </>
    ),
    bullets: ['Leg gleich zu Beginn deine gängigen Materialpositionen unter „Material“ an.']
  },
  {
    title: 'Los geht’s',
    preview: 'welcome',
    body: (
      <>
        Du bist startklar. Wenn etwas unklar ist, melde dich bei deinem Ansprechpartner.
      </>
    ),
    bullets: [
      'Die Tour erscheint nur einmal pro Browser. Willst du sie nochmal sehen, lösche die Website-Daten für diese Seite oder den Eintrag im Speicher.'
    ]
  }
]

interface OnboardingScreenProps {
  onFinished: () => void
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onFinished }) => {
  const [index, setIndex] = useState(0)
  const slide = slides[index]
  const isLast = index === slides.length - 1

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    onFinished()
  }

  return (
    <div className="onboarding-screen">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <img src="/brand-logo.png" alt="" className="onboarding-logo" />
          <span className="onboarding-brand-text">{APP_DISPLAY_NAME}</span>
        </div>
        <div className="onboarding-progress" aria-hidden="true">
          {slides.map((_, i) => (
            <span key={i} className={`onboarding-dot ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}`} />
          ))}
        </div>

        <OnboardingDemoPreview variant={slide.preview} />

        <h1 className="onboarding-title">{slide.title}</h1>
        <div className="onboarding-body">{slide.body}</div>
        {slide.bullets && slide.bullets.length > 0 && (
          <ul className="onboarding-bullets">
            {slide.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        <div className="onboarding-actions">
          <button type="button" className="btn secondary-btn" onClick={finish}>
            Überspringen
          </button>
          {!isLast ? (
            <button type="button" className="btn primary-btn" onClick={() => setIndex((i) => i + 1)}>
              Weiter
            </button>
          ) : (
            <button type="button" className="btn primary-btn" onClick={finish}>
              Zur Anmeldung
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default OnboardingScreen
