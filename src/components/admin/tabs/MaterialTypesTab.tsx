import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { MaterialType } from '../../../types'
import { toast } from '../../ToastContainer'
import MaterialTypeModal from '../MaterialTypeModal'
import '../../../styles/AdminTabs.css'

const MaterialTypesTab: React.FC = () => {
  const [items, setItems] = useState<MaterialType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<MaterialType | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    try {
      const list = await DataService.getAllMaterialTypes()
      setItems(list)
    } catch (e) {
      console.error(e)
      toast.error('Material konnte nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (isLoading) {
    return <div className="loading">Lade Material…</div>
  }

  return (
    <div className="vehicles-tab">
      <div className="tab-header">
        <div>
          <h3>Material</h3>
          <p className="no-data" style={{ marginTop: 4, marginBottom: 0 }}>
            Hier legen Sie Verbrauchsmaterial mit Einheit und optional Preis fest. Mitarbeiter wählen beim Ausstempeln aus dieser Liste.
          </p>
        </div>
        <button type="button" onClick={() => { setEditing(null); setShowModal(true) }} className="btn primary-btn">
          Material hinzufügen
        </button>
      </div>

      {items.length === 0 ? (
        <p className="no-data">Noch keine Materialarten – bitte anlegen.</p>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Einheit</th>
                <th>Preis / Einheit</th>
                <th>Sort.</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.unitLabel || '—'}</td>
                  <td>{typeof m.unitPriceEur === 'number' ? `${m.unitPriceEur.toFixed(2)} €` : '—'}</td>
                  <td>{m.sortOrder ?? 0}</td>
                  <td>
                    <span className={`status-badge ${m.isActive !== false ? 'active' : 'inactive'}`}>
                      {m.isActive !== false ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn secondary-btn" onClick={() => { setEditing(m); setShowModal(true) }}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn secondary-btn"
                      disabled={deletingId === m.id}
                      onClick={async () => {
                        if (!confirm(`„${m.name}“ wirklich löschen?`)) return
                        setDeletingId(m.id)
                        try {
                          await DataService.deleteMaterialType(m.id)
                          toast.success('Gelöscht')
                          await load()
                        } catch (err: any) {
                          toast.error(err?.message || 'Löschen fehlgeschlagen')
                        } finally {
                          setDeletingId(null)
                        }
                      }}
                    >
                      {deletingId === m.id ? '…' : 'Löschen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <MaterialTypeModal
          item={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={() => { setShowModal(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export default MaterialTypesTab
