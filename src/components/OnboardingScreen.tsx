import React, { useState } from 'react'
import { ONBOARDING_STORAGE_KEY } from '../constants/onboarding'
import { APP_DISPLAY_NAME } from '../constants/appBranding'
import '../styles/OnboardingScreen.css'

const slides: { title: string; body: React.ReactNode; bullets?: string[] }[] = [
  {
    title: 'Willkommen',
    body: (
      <>
        Diese kurze Tour erklärt die wichtigsten Schritte in der <strong>{APP_DISPLAY_NAME}</strong>.
      </>
    ),
    bullets: ['Mit „Weiter“ geht es Schritt für Schritt voran.', 'Überspringen ist jederzeit möglich.']
  },
  {
    title: 'Anmeldung & Baustelle',
    body: (
      <>
        Melden Sie sich mit Benutzername und Passwort an. Zum <strong>Einstempeln</strong> wählen Sie die aktuelle Baustelle aus der Liste.
      </>
    ),
    bullets: ['Nur eine aktive Stempelung gleichzeitig.', 'Die Auswahl entspricht den im Admin angelegten Projekten.']
  },
  {
    title: 'Ausstempeln & Material',
    body: (
      <>
        Beim <strong>Ausstempeln</strong> geben Sie die Pausenzeit an und tragen Sie den <strong>Materialverbrauch</strong> ein (z.&nbsp;B. Fliesen in m²).
      </>
    ),
    bullets: [
      'Materialarten und Preise legt der Administrator unter „Material“ fest.',
      'Ohne Material: Häkchen bei „Heute wurde kein Verbrauchsmaterial verbucht“.',
      '„Einfach Ausstempeln“ speichert Zeit und Material; „Mit Dokumentation“ erlaubt Fotos und Notizen.'
    ]
  },
  {
    title: 'Dokumentation & Berichte',
    body: (
      <>
        Sie können <strong>Fotos</strong> und <strong>Lieferscheine</strong> während oder nach der Arbeit ergänzen. Über <strong>„Bericht nachtragen“</strong> lassen sich abgeschlossene Tage mit Dokumentation nachziehen.
      </>
    ),
    bullets: ['Urlaubsanträge finden Sie im Menü unter dem passenden Eintrag.']
  },
  {
    title: 'Administration',
    body: (
      <>
        Im <strong>Admin-Bereich</strong> verwalten Sie Mitarbeiter, Projekte, <strong>Material</strong> mit Einheit und Preis sowie Auswertungen.
      </>
    ),
    bullets: ['Nach dem ersten Login sollten Sie unter „Material“ Ihre gängigen Positionen anlegen.']
  },
  {
    title: 'Los geht’s',
    body: <>Sie sind startklar. Wenn Sie Fragen haben, wenden Sie sich an Ihren Ansprechpartner.</>,
    bullets: ['Die Tour erscheint nur einmal pro Gerät (Speicher im Browser). Zum erneuten Anzeigen kann der Website-Daten-Eintrag für diese Seite gelöscht werden.']
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
