import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createInspection, listInspections } from '../../services/data/inspections'
import type { Inspection } from '../../types/inspection'
import { floorArea } from '../../utils/roomGeometry'
import { toast } from '../ToastContainer'
import '../../styles/AdminTabs.css'
import '../../styles/Besichtigung.css'

interface InspectionsTabProps {
  adminName?: string
}

const InspectionsTab: React.FC<InspectionsTabProps> = ({ adminName }) => {
  const navigate = useNavigate()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    listInspections()
      .then(setInspections)
      .catch((error) => {
        console.error('Besichtigungen konnten nicht geladen werden:', error)
        toast.error('Besichtigungen konnten nicht geladen werden')
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleNew = async () => {
    setIsCreating(true)
    try {
      const id = await createInspection(adminName)
      navigate(`/admin/besichtigung/${id}`)
    } catch (error: any) {
      toast.error('Besichtigung konnte nicht angelegt werden: ' + (error?.message || 'Unbekannter Fehler'))
      setIsCreating(false)
    }
  }

  if (isLoading) return <div className="loading">Lade Besichtigungen…</div>

  return (
    <div className="inspections-tab">
      <div className="tab-header">
        <h3>Besichtigungen</h3>
        <div className="tab-header-actions">
          <button type="button" className="btn primary-btn" onClick={handleNew} disabled={isCreating}>
            {isCreating ? 'Lege an…' : '+ Neue Besichtigung'}
          </button>
        </div>
      </div>

      {inspections.length === 0 ? (
        <p className="no-data">Noch keine Besichtigungen. Beim nächsten Termin beim Kunden einfach hier starten.</p>
      ) : (
        <ul className="inspection-list">
          {inspections.map((i) => {
            const area = i.rooms.reduce((sum, r) => sum + floorArea(r.walls), 0)
            return (
              <li key={i.id}>
                <button type="button" className="inspection-list-item" onClick={() => navigate(`/admin/besichtigung/${i.id}`)}>
                  <div className="inspection-list-main">
                    <strong>{i.customerName || 'Ohne Kunde'}</strong>
                    <span>{i.address || 'Ohne Adresse'}</span>
                  </div>
                  <div className="inspection-list-meta">
                    <span>{i.updatedAt.toLocaleDateString('de-DE')}</span>
                    <span>
                      {i.rooms.length} {i.rooms.length === 1 ? 'Raum' : 'Räume'}
                      {area > 0 ? ` · ${area.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m²` : ''}
                    </span>
                    <span>
                      {i.lvPositions.length} Pos. · {i.photos.length} Fotos
                    </span>
                    {i.offerNumber ? (
                      <span className="status-badge active">Angebot {i.offerNumber}</span>
                    ) : (
                      <span className="status-badge inactive">offen</span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default InspectionsTab
