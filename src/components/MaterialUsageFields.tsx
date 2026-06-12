import React, { useEffect, useState } from 'react'
import { DataService } from '../services/dataService'
import type { MaterialType, TimeEntryMaterialUsage } from '../types'
import '../styles/MaterialUsageFields.css'

export type MaterialUsageRow = { key: string; materialTypeId: string; quantity: string }

function newRow(): MaterialUsageRow {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    materialTypeId: '',
    quantity: ''
  }
}

export interface MaterialUsageFieldsProps {
  /** Wenn true, wird kein Material an den Parent übergeben (leeres Array). */
  noMaterial: boolean
  onNoMaterialChange: (v: boolean) => void
  rows: MaterialUsageRow[]
  onRowsChange: (rows: MaterialUsageRow[]) => void
}

export function buildMaterialUsagesFromRows(
  rows: MaterialUsageRow[],
  typesById: Map<string, MaterialType>
): TimeEntryMaterialUsage[] | null {
  const out: TimeEntryMaterialUsage[] = []
  for (const r of rows) {
    const id = r.materialTypeId.trim()
    const qty = Number.parseFloat(String(r.quantity).replace(',', '.'))
    if (!id) continue
    if (!Number.isFinite(qty) || qty <= 0) {
      return null
    }
    const t = typesById.get(id)
    out.push({
      materialTypeId: id,
      materialName: t?.name,
      unitLabel: t?.unitLabel,
      quantity: qty,
      unitPriceEur: typeof t?.unitPriceEur === 'number' ? t.unitPriceEur : undefined
    })
  }
  return out
}

const MaterialUsageFieldsComponent: React.FC<MaterialUsageFieldsProps> = ({
  noMaterial,
  onNoMaterialChange,
  rows,
  onRowsChange
}) => {
  const [types, setTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await DataService.getActiveMaterialTypes()
        if (!cancelled) setTypes(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const addRow = () => onRowsChange([...rows, newRow()])
  const removeRow = (key: string) => {
    const next = rows.filter((r) => r.key !== key)
    onRowsChange(next.length ? next : [newRow()])
  }
  const patchRow = (key: string, patch: Partial<MaterialUsageRow>) => {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <div className="material-usage-fields">
      <h4 className="material-usage-title">Verbrauchsmaterial</h4>
      <p className="material-usage-intro">
        Bitte beim Ausstempeln angeben, welches Material verbaut wurde (z.&nbsp;B. Fliesen in m²). Die Auswahl kommt aus dem Admin-Bereich „Material“.
      </p>

      <label className="material-usage-no-material">
        <input
          type="checkbox"
          checked={noMaterial}
          onChange={(e) => onNoMaterialChange(e.target.checked)}
        />
        <span>Heute wurde kein Verbrauchsmaterial verbucht</span>
      </label>

      {!noMaterial && (
        <>
          {loading ? (
            <p className="material-usage-loading">Materialarten werden geladen…</p>
          ) : types.length === 0 ? (
            <p className="material-usage-empty">
              Es sind noch keine Materialarten angelegt. Bitte den Administrator unter <strong>Material</strong> informieren.
            </p>
          ) : (
            <>
              <div className="material-usage-rows">
                {rows.map((row) => (
                  <div key={row.key} className="material-usage-row">
                    <select
                      className="material-usage-select"
                      value={row.materialTypeId}
                      onChange={(e) => patchRow(row.key, { materialTypeId: e.target.value })}
                      aria-label="Materialart"
                    >
                      <option value="">— Material wählen —</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.unitLabel ? ` (${t.unitLabel})` : ''}
                          {typeof t.unitPriceEur === 'number' ? ` · ${t.unitPriceEur.toFixed(2)} €/${t.unitLabel || 'Einheit'}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="material-usage-qty"
                      placeholder="Menge"
                      value={row.quantity}
                      onChange={(e) => patchRow(row.key, { quantity: e.target.value })}
                      aria-label="Menge"
                    />
                    <button
                      type="button"
                      className="material-usage-remove"
                      onClick={() => removeRow(row.key)}
                      aria-label="Zeile entfernen"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn secondary-btn material-usage-add" onClick={addRow}>
                Weitere Position
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default MaterialUsageFieldsComponent
export { newRow as createMaterialUsageRow }
