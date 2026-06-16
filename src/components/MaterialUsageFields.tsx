import React, { useEffect, useMemo, useState } from 'react'
import { DataService } from '../services/dataService'
import type { MaterialType, TimeEntryMaterialUsage } from '../types'
import '../styles/MaterialUsageFields.css'

export type MaterialUsageRow = {
  key: string
  /** Gewählte Materialart (falls aus der Liste); leer bei Freitext */
  materialTypeId: string
  /** Angezeigter/eingegebener Text (Listentreffer oder Freitext) */
  label: string
  quantity: string
}

function newRow(): MaterialUsageRow {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    materialTypeId: '',
    label: '',
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
    const label = (r.label || '').trim()
    const qty = Number.parseFloat(String(r.quantity).replace(',', '.'))
    if (!id && !label) continue
    if (!Number.isFinite(qty) || qty <= 0) {
      return null
    }
    if (id) {
      const t = typesById.get(id)
      out.push({
        materialTypeId: id,
        materialName: t?.name || label,
        unitLabel: t?.unitLabel,
        quantity: qty,
        unitPriceEur: typeof t?.unitPriceEur === 'number' ? t.unitPriceEur : undefined
      })
    } else {
      // Freitext-Position (kein Listentreffer): kein Preis hinterlegt
      out.push({
        materialTypeId: '',
        materialName: label,
        quantity: qty
      })
    }
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

  // Name → Materialart (für Treffer-Auflösung bei der Eingabe)
  const typeByName = useMemo(() => {
    const map = new Map<string, MaterialType>()
    for (const t of types) {
      if (t.name) map.set(t.name.trim().toLowerCase(), t)
    }
    return map
  }, [types])

  const addRow = () => onRowsChange([...rows, newRow()])
  const removeRow = (key: string) => {
    const next = rows.filter((r) => r.key !== key)
    onRowsChange(next.length ? next : [newRow()])
  }
  const patchRow = (key: string, patch: Partial<MaterialUsageRow>) => {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const onLabelChange = (key: string, value: string) => {
    const match = typeByName.get(value.trim().toLowerCase())
    patchRow(key, { label: value, materialTypeId: match?.id || '' })
  }

  return (
    <div className="material-usage-fields">
      <h4 className="material-usage-title">Verbrauchsmaterial</h4>
      <p className="material-usage-intro">
        Bitte beim Ausstempeln angeben, welches Material verbaut wurde (z.&nbsp;B. Fliesen in m²). Tippen,
        um aus der Liste zu wählen – oder eigenen Text eingeben.
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
          ) : (
            <>
              <datalist id="material-usage-options">
                {types.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.unitLabel ? `Einheit: ${t.unitLabel}` : ''}
                  </option>
                ))}
              </datalist>
              <div className="material-usage-rows">
                {rows.map((row) => (
                  <div key={row.key} className="material-usage-row">
                    <input
                      type="text"
                      list="material-usage-options"
                      className="material-usage-select"
                      placeholder="Material wählen oder eingeben"
                      value={row.label}
                      onChange={(e) => onLabelChange(row.key, e.target.value)}
                      aria-label="Material"
                    />
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
