import React from 'react'
import '../styles/OnboardingDemoPreview.css'

export type OnboardingDemoVariant =
  | 'welcome'
  | 'login'
  | 'clockin'
  | 'clockout'
  | 'documentation'
  | 'admin'

interface OnboardingDemoPreviewProps {
  variant: OnboardingDemoVariant
}

/** Vereinfachte App-Ausschnitte für die Tour + animierter „Finger“-Cursor */
const OnboardingDemoPreview: React.FC<OnboardingDemoPreviewProps> = ({ variant }) => {
  return (
    <div className={`onboarding-demo onboarding-demo--${variant}`} aria-hidden="true">
      <div className="onboarding-demo-chrome">
        <span className="onboarding-demo-dot" />
        <span className="onboarding-demo-dot" />
        <span className="onboarding-demo-dot" />
        <span className="onboarding-demo-url">App-Vorschau</span>
      </div>
      <div className="onboarding-demo-body">
        <div className="onboarding-demo-stage">
          <span className="onboarding-cursor" />

          {variant === 'welcome' && (
            <div className="onboarding-demo-welcome">
              <div className="onboarding-demo-logo-mini" />
              <div className="onboarding-demo-line wide" />
              <div className="onboarding-demo-line" />
            </div>
          )}

          {variant === 'login' && (
            <div className="onboarding-demo-login">
              <div className="onboarding-demo-line short" />
              <div className="onboarding-demo-field" />
              <div className="onboarding-demo-field" />
              <div className="onboarding-demo-btn primary">Anmelden</div>
            </div>
          )}

          {variant === 'clockin' && (
            <div className="onboarding-demo-clockin">
              <div className="onboarding-demo-label">Projekt</div>
              <div className="onboarding-demo-select">
                <span>Muster-Baustelle</span>
              </div>
              <div className="onboarding-demo-btn primary">Einstempeln</div>
            </div>
          )}

          {variant === 'clockout' && (
            <div className="onboarding-demo-clockout">
              <div className="onboarding-demo-line short" />
              <div className="onboarding-demo-field small" />
              <div className="onboarding-demo-check">
                <span className="onboarding-demo-check-box" /> Kein Material
              </div>
              <div className="onboarding-demo-row">
                <div className="onboarding-demo-select tiny" />
                <div className="onboarding-demo-field tiny" />
              </div>
              <div className="onboarding-demo-btn secondary">Ausstempeln</div>
            </div>
          )}

          {variant === 'documentation' && (
            <div className="onboarding-demo-doc">
              <div className="onboarding-demo-nav">
                <span className="onboarding-demo-nav-icon">☰</span>
                <span className="onboarding-demo-nav-spacer" />
              </div>
              <div className="onboarding-demo-pill">Bericht nachtragen</div>
              <div className="onboarding-demo-line short" style={{ marginTop: 10 }} />
              <div className="onboarding-demo-thumb" />
            </div>
          )}

          {variant === 'admin' && (
            <div className="onboarding-demo-admin">
              <div className="onboarding-demo-admin-sidebar">
                <div className="onboarding-demo-admin-tab active">Übersicht</div>
                <div className="onboarding-demo-admin-tab">Mitarbeiter</div>
                <div className="onboarding-demo-admin-tab hit-material">Material</div>
              </div>
              <div className="onboarding-demo-admin-main">
                <div className="onboarding-demo-line short" />
                <div className="onboarding-demo-table-row">
                  <span>Fliese</span>
                  <span>m²</span>
                  <span>24 €</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="onboarding-demo-caption">So sieht es in der echten App ähnlich aus – nur verkleinert.</p>
    </div>
  )
}

export default OnboardingDemoPreview
