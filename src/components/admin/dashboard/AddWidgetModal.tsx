import React, { useMemo, useState } from 'react'
import { WIDGET_REGISTRY } from './widgetRegistry'
import type { WidgetCategory, WidgetDef } from './types'
import '../../../styles/Modal.css'

interface AddWidgetModalProps {
  /** Bereits platzierte Widget-Keys (nur zur Info-Markierung). */
  usedKeys: string[]
  onAdd: (key: string) => void
  onClose: () => void
}

const CATEGORY_ORDER: WidgetCategory[] = ['Kennzahlen', 'Projekte', 'Stammdaten', 'Berichte', 'System']

const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ usedKeys, onAdd, onClose }) => {
  const [search, setSearch] = useState('')
  const used = useMemo(() => new Set(usedKeys), [usedKeys])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<WidgetCategory, WidgetDef[]>()
    for (const w of WIDGET_REGISTRY) {
      if (q && !`${w.title} ${w.description}`.toLowerCase().includes(q)) continue
      const list = map.get(w.category) || []
      list.push(w)
      map.set(w.category, list)
    }
    return map
  }, [search])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content dw-add-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Widget hinzufügen</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div className="modal-body">
          <p className="dw-add-intro">
            Wähle Funktionen aus dem Pool. Du kannst mehrere hinzufügen und das Fenster danach schließen.
          </p>
          <input
            type="text"
            className="dw-add-search"
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
            <div key={category} className="dw-add-group">
              <h4 className="dw-add-group-title">{category}</h4>
              <div className="dw-add-grid">
                {(grouped.get(category) || []).map((w) => (
                  <div key={w.key} className="dw-add-card">
                    <span className="dw-add-icon" aria-hidden="true">{w.icon}</span>
                    <div className="dw-add-text">
                      <strong>{w.title}</strong>
                      <span>{w.description}</span>
                    </div>
                    <button
                      type="button"
                      className="btn primary-btn dw-add-btn"
                      onClick={() => onAdd(w.key)}
                    >
                      {used.has(w.key) ? 'Nochmal' : 'Hinzufügen'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {grouped.size === 0 && <p className="no-data">Keine Widgets gefunden.</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn primary-btn" onClick={onClose}>Fertig</button>
        </div>
      </div>
    </div>
  )
}

export default AddWidgetModal
