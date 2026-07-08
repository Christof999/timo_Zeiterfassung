import { useState, useEffect, useMemo } from 'react'
import { DataService } from '../../../services/dataService'
import { heroService } from '../../../services/heroService'
import type { MaterialType } from '../../../types'
import { toast } from '../../ToastContainer'
import MaterialTypeModal from '../MaterialTypeModal'
import ListSearch from '../ListSearch'
import '../../../styles/AdminTabs.css'

const MaterialTypesTab: React.FC = () => {
  const [items, setItems] = useState<MaterialType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<MaterialType | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  const handleDeleteAll = async () => {
    if (items.length === 0) {
      toast.error('Keine Artikel zum Löschen vorhanden')
      return
    }
    if (!confirm(`Wirklich ALLE ${items.length} Artikel/Materialarten löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return
    }
    setIsDeletingAll(true)
    try {
      const deleted = await DataService.deleteAllMaterialTypes()
      toast.success(`${deleted} Artikel gelöscht`)
      await load()
    } catch (error: any) {
      toast.error('Löschen fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsDeletingAll(false)
    }
  }

  const handleHeroImport = async () => {
    setIsImporting(true)
    try {
      const result = await heroService.syncMaterials()
      const stats = result.materialStats
      toast.success(
        stats
          ? `Artikel-Import: ${stats.created} neu, ${stats.updated} aktualisiert.`
          : 'Artikel aus HERO importiert.'
      )
      await load()
    } catch (error: any) {
      toast.error('HERO-Artikel-Import fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsImporting(false)
    }
  }

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return items
    return items.filter((m) =>
      [m.name, m.unitLabel]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    )
  }, [items, searchTerm])

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
            Hier legen Sie Verbrauchsmaterial mit Einheit, Verkaufs- und Einkaufspreis fest. Die Marge (Verkauf − Einkauf) ist nur intern sichtbar; Mitarbeiter wählen beim Ausstempeln nur Bezeichnung und Menge.
          </p>
        </div>
        <div className="tab-header-actions">
          <button type="button" onClick={handleHeroImport} className="btn secondary-btn" disabled={isImporting}>
            {isImporting ? 'Importiere…' : 'Aus HERO importieren'}
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              className="btn delete-btn"
              disabled={isDeletingAll}
            >
              {isDeletingAll ? 'Lösche…' : `Alle Artikel löschen (${items.length})`}
            </button>
          )}
          <button type="button" onClick={() => { setEditing(null); setShowModal(true) }} className="btn primary-btn">
            Material hinzufügen
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="no-data">Noch keine Materialarten – bitte anlegen.</p>
      ) : (
        <>
          <ListSearch
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Material suchen (Bezeichnung, Einheit)"
          />
          {filteredItems.length === 0 ? (
            <p className="no-data">Keine Treffer für „{searchTerm}"</p>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bezeichnung</th>
                    <th>Einheit</th>
                    <th>Verkauf</th>
                    <th>Einkauf</th>
                    <th>Marge</th>
                    <th>Sort.</th>
                    <th>Status</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((m) => {
                  const hasMargin =
                    typeof m.unitPriceEur === 'number' && typeof m.purchasePriceEur === 'number'
                  const margin = hasMargin ? m.unitPriceEur! - m.purchasePriceEur! : null
                  const marginPct =
                    margin != null && m.unitPriceEur! > 0 ? (margin / m.unitPriceEur!) * 100 : null
                  return (
                <tr key={m.id}>
                  <td data-label="Bezeichnung">{m.name}</td>
                  <td data-label="Einheit">{m.unitLabel || '—'}</td>
                  <td data-label="Verkauf">{typeof m.unitPriceEur === 'number' ? `${m.unitPriceEur.toFixed(2)} €` : '—'}</td>
                  <td data-label="Einkauf">{typeof m.purchasePriceEur === 'number' ? `${m.purchasePriceEur.toFixed(2)} €` : '—'}</td>
                  <td data-label="Marge">
                    {margin != null ? (
                      <span className={`material-margin-cell ${margin < 0 ? 'is-negative' : ''}`}>
                        {margin.toFixed(2)} €{marginPct != null ? ` · ${marginPct.toFixed(0)} %` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Sort.">{m.sortOrder ?? 0}</td>
                  <td data-label="Status">
                    <span className={`status-badge ${m.isActive !== false ? 'active' : 'inactive'}`}>
                      {m.isActive !== false ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="action-buttons" data-label="">
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
                  )
                })}
                </tbody>
              </table>
            </div>
          )}
        </>
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
