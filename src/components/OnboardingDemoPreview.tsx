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

          {/* Realistischer Maus-Cursor (SVG-Pfeil) */}
          <span className="onboarding-cursor">
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M1.5 1.5 L1.5 14.5 L4.5 10.8 L7 16.5 L9.5 15.4 L7 9.7 L11.5 9.7 Z"
                fill="white"
                stroke="#1a1a1a"
                strokeWidth="1.3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </span>

          {/* ── WELCOME / FERTIG ── */}
          {variant === 'welcome' && (
            <div className="odp-page odp-welcome-page">
              <div className="odp-welcome-brand">
                <div className="odp-logo-box odp-logo-lg" />
                <div>
                  <div className="odp-text odp-bold odp-size-md">Zeiterfassung</div>
                  <div className="odp-text odp-muted odp-size-xs">Mitarbeiter-App</div>
                </div>
              </div>
              <div className="odp-welcome-list">
                <div className="odp-welcome-item">
                  <span className="odp-fi">⏱</span>
                  <span className="odp-text odp-size-xs">Einstempeln &amp; Ausstempeln</span>
                </div>
                <div className="odp-welcome-item">
                  <span className="odp-fi">📦</span>
                  <span className="odp-text odp-size-xs">Materialerfassung</span>
                </div>
                <div className="odp-welcome-item">
                  <span className="odp-fi">📸</span>
                  <span className="odp-text odp-size-xs">Fotos &amp; Lieferscheine</span>
                </div>
                <div className="odp-welcome-item">
                  <span className="odp-fi">🗂</span>
                  <span className="odp-text odp-size-xs">Admin-Auswertungen</span>
                </div>
              </div>
            </div>
          )}

          {/* ── LOGIN ── */}
          {variant === 'login' && (
            <div className="odp-page odp-login-page">
              <div className="odp-hdr">
                <div className="odp-logo-box" />
                <div>
                  <div className="odp-text odp-bold odp-size-sm">Zeiterfassung</div>
                  <div className="odp-text odp-muted odp-size-xxs">Mitarbeiter-Zeiterfassung</div>
                </div>
              </div>
              <div className="odp-main">
                <div className="odp-card">
                  <div className="odp-card-h">Anmeldung</div>
                  <div className="odp-fg">
                    <div className="odp-lbl">Benutzername:</div>
                    <div className="odp-inp" />
                  </div>
                  <div className="odp-fg">
                    <div className="odp-lbl">Passwort:</div>
                    <div className="odp-inp odp-inp-pw">
                      <span className="odp-pw-dots">••••••</span>
                    </div>
                  </div>
                  <div className="odp-btn odp-btn-p odp-btn-full">Anmelden</div>
                  <div className="odp-hr" />
                  <div className="odp-text odp-link odp-size-xxs">Admin-Bereich</div>
                </div>
              </div>
            </div>
          )}

          {/* ── EINSTEMPELN ── */}
          {variant === 'clockin' && (
            <div className="odp-page odp-clockin-page">
              <div className="odp-hdr odp-hdr-menu">
                <div className="odp-logo-box" />
                <div className="odp-text odp-bold odp-size-sm">Zeiterfassung</div>
                <div className="odp-menu">☰</div>
              </div>
              <div className="odp-main">
                <div className="odp-userbar">
                  <div className="odp-avatar" />
                  <div className="odp-text odp-muted odp-size-xs">Guten Morgen, Max M.</div>
                  <div className="odp-theme-dot" />
                </div>
                <div className="odp-card">
                  <div className="odp-lbl odp-lbl-md">Projekt auswählen:</div>
                  <div className="odp-sel">
                    <span>Muster-Baustelle</span>
                    <span className="odp-arr">▼</span>
                  </div>
                  <div className="odp-btn odp-btn-p odp-btn-full">Einstempeln</div>
                </div>
              </div>
            </div>
          )}

          {/* ── AUSSTEMPELN & MATERIAL ── */}
          {variant === 'clockout' && (
            <div className="odp-page odp-clockout-page">
              <div className="odp-hdr odp-hdr-menu">
                <div className="odp-logo-box" />
                <div className="odp-text odp-bold odp-size-sm">Zeiterfassung</div>
                <div className="odp-menu">☰</div>
              </div>
              <div className="odp-main">
                <div className="odp-proj-card">
                  <div className="odp-proj-badge">Aktives Projekt</div>
                  <div className="odp-proj-name">Muster-Baustelle</div>
                  <div className="odp-proj-time">⏱ 04:25:33</div>
                </div>
                <div className="odp-card">
                  <div className="odp-pause-row">
                    <div className="odp-text odp-muted odp-size-xxs">
                      Einstempel: <b>07:30</b>
                    </div>
                    <div className="odp-pause-right">
                      <div className="odp-lbl">Pause (Min):</div>
                      <div className="odp-inp odp-inp-sm odp-inp-val">0</div>
                    </div>
                  </div>
                  <div className="odp-chk-row">
                    <div className="odp-chk odp-chk-on" />
                    <span className="odp-text odp-size-xs">Kein Material verwendet</span>
                  </div>
                  <div className="odp-btn-row">
                    <div className="odp-btn odp-btn-p odp-btn-sm">Ausstempeln</div>
                    <div className="odp-btn odp-btn-s odp-btn-sm">Mit Doku</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── DOKUMENTATION ── */}
          {variant === 'documentation' && (
            <div className="odp-page odp-doc-page">
              <div className="odp-hdr odp-hdr-menu">
                <div className="odp-logo-box" />
                <div className="odp-text odp-bold odp-size-sm">Zeiterfassung</div>
                <div className="odp-menu odp-menu-highlight">☰</div>
              </div>
              <div className="odp-main">
                <div className="odp-retro">
                  <span className="odp-fi odp-fi-sm">📋</span>
                  <span className="odp-text odp-bold odp-size-xs">Bericht nachtragen</span>
                  <span className="odp-retro-arr">›</span>
                </div>
                <div className="odp-card">
                  <div className="odp-act-h">Letzte Aktivitäten</div>
                  <div className="odp-act-row odp-act-row-highlight">
                    <div className="odp-act-dt">Mo, 22.04.</div>
                    <div className="odp-act-info">
                      <div className="odp-text odp-size-xs">Muster-Baustelle</div>
                      <div className="odp-text odp-muted odp-size-xxs">07:30 – 16:00</div>
                    </div>
                    <div className="odp-text odp-bold odp-size-xs">8,5 h</div>
                  </div>
                  <div className="odp-act-row">
                    <div className="odp-act-dt">Di, 21.04.</div>
                    <div className="odp-act-info">
                      <div className="odp-text odp-size-xs">Muster-Baustelle</div>
                      <div className="odp-text odp-muted odp-size-xxs">07:45 – 17:00</div>
                    </div>
                    <div className="odp-text odp-bold odp-size-xs">8,75 h</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN ── */}
          {variant === 'admin' && (
            <div className="odp-page odp-admin-page">
              <div className="odp-admin-hdr">
                <div className="odp-text odp-bold odp-size-sm">Admin-Bereich</div>
                <div className="odp-btn odp-btn-o odp-btn-xs">Abmelden</div>
              </div>
              <div className="odp-tabs">
                <div className="odp-tab">Übersicht</div>
                <div className="odp-tab">Mitarbeiter</div>
                <div className="odp-tab">Projekte</div>
                <div className="odp-tab odp-tab-on">Material</div>
                <div className="odp-tab">Berichte</div>
                <div className="odp-tab">Urlaub</div>
              </div>
              <div className="odp-admin-body">
                <div className="odp-content-ttl">Materialarten</div>
                <div className="odp-tbl-hdr">
                  <span>Name</span>
                  <span>Einheit</span>
                  <span>Preis</span>
                </div>
                <div className="odp-tbl-row odp-tbl-row-hi">
                  <span>Fliese</span><span>m²</span><span>24,00 €</span>
                </div>
                <div className="odp-tbl-row">
                  <span>Kabel</span><span>m</span><span>3,50 €</span>
                </div>
                <div className="odp-tbl-row">
                  <span>Mörtel</span><span>kg</span><span>0,80 €</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      <p className="onboarding-demo-caption">Miniaturansicht der App – ohne Funktion</p>
    </div>
  )
}

export default OnboardingDemoPreview
