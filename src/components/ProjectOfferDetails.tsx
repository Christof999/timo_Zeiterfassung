import type { Project } from '../types'
import { SiteRow } from './ProjectSiteCard'

/** Ausschließlich die für die Ausführung benötigten Angaben rendern. */
export function ProjectOfferDetails({ project }: { project: Project | null | undefined }) {
  const positions = project?.offerPositions?.filter(position => position.kind === 'material') ?? []
  if (!positions.length) return null
  return <SiteRow icon="offer" title={`Leistungsumfang${project?.offerMeta?.nr ? ` · Angebot ${project?.offerMeta.nr}` : ''}`} count={positions.length}>
    <ul>{positions.map((position, index) => <li key={index}>
      <strong>{position.name}</strong>
      <small>{(position.quantity ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} {position.unit}</small>
    </li>)}</ul>
  </SiteRow>
}

