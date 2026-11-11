import type { ReactNode } from 'react'
import type { Project } from '../types'
import '../styles/ProjectSiteCard.css'
import Icon, { type RowIcon } from './Icon'


/** Baustelle auf einen Blick: Karte mit Marker auf der Adresse, darüber Name, Kunde und Route. */
export default function ProjectSiteCard({ project, badge, children }: { project: Project | null; badge?: string; children?: ReactNode }) {
  const address = project?.address || project?.location || ''
  const client = project?.client || project?.customerName
  const query = encodeURIComponent(address)
  return <section className="site-card">
    {address
      ? <iframe className="site-card-map" title={`Karte: ${address}`} src={`https://maps.google.com/maps?q=${query}&z=16&output=embed`} />
      : <div className="site-card-map site-card-map-empty">Keine Adresse hinterlegt</div>}
    <div className="site-card-head">
      <div className="site-card-text">
        {badge && <span className="site-card-badge">{badge}</span>}
        <h3>{project?.name || 'Unbekanntes Projekt'}</h3>
        {client && <p>{client}</p>}
        {address && <p>{address}</p>}
      </div>
      {address && <a className="site-card-route" href={`https://www.google.com/maps/dir/?api=1&destination=${query}`} target="_blank" rel="noopener noreferrer" aria-label={`Route nach ${address}`}>
        <Icon name="route" />
      </a>}
    </div>
    {children}
  </section>
}

/** Aufklappbare Zeile einer Projektkarte: Symbol, Titel, Anzahl, Pfeil. */
export function SiteRow({ icon, title, count, children }: { icon: RowIcon; title: string; count?: number; children: ReactNode }) {
  return <details className="site-row">
    <summary className="site-row-head">
      <span className="site-row-icon"><Icon name={icon} /></span>
      <span className="site-row-title">{title}</span>
      {count !== undefined && <span className="site-row-count">{count}</span>}
    </summary>
    <div className="site-row-body">{children}</div>
  </details>
}

/** Zeile als Schaltfläche, die einen Dialog öffnet: Symbol, Titel, optional Hinweis, Pfeil. */
export function ActionRow({ icon, title, hint, onClick }: { icon: RowIcon; title: string; hint?: string; onClick: () => void }) {
  return <button type="button" className="site-row site-row-head site-action" onClick={onClick}>
    <span className="site-row-icon"><Icon name={icon} /></span>
    <span className="site-row-title">{title}{hint && <small>{hint}</small>}</span>
  </button>
}
