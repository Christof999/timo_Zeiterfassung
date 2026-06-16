import React, { useEffect, useMemo, useState } from 'react'
import { DataService } from '../services/dataService'
import type { MaterialType, TimeEntryMaterialUsage } from '../types'
import '../styles/MaterialUsageFields.css'

export type MaterialUsageRow = {
  key: string
  /** Gewählte Materialart (falls aus dem Katalog); leer bei Freitext/Angebot */
  materialTypeId: string
  /** Angezeigter/eingegebener Text (Listentreffer oder Freitext) */
  label: string
  quantity: string
  /** Bei Angebots-/Freitext-Treffer übernommene Einheit (für Nachkalkulation) */
  unit?: string
  /** Bei Angebots-Treffer übernommener Stückpreis (nur Admin/Nachkalkulation) */
  unitPriceEur?: number
}

/** Angebots-Materialposition (kurze, projektbezogene Auswahl beim Einstempeln) */
export type OfferMaterialOption = { name: string; unit?: string; unitPriceEur?: number }

/** Vereinheitlichte Auswahl-Option (Angebot oder globaler Katalog) */
type PickOption = { name: string; unit?: string; unitPriceEur?: number; id?: string }

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
  /** Wenn gesetzt (Projekt mit Angebot): Auswahl nur aus diesen Positionen + Freitext. */
  offerMaterials?: OfferMaterialOption[]
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
      // Angebots- oder Freitext-Position: Einheit/Preis (falls aus Angebot) mitnehmen
      out.push({
        materialTypeId: '',
        materialName: label,
        unitLabel: r.unit,
        quantity: qty,
        unitPriceEur: typeof r.unitPriceEur === 'number' ? r.unitPriceEur : undefined
      })
    }
  }
  return out
}

/** Eingabefeld mit aufklappbarer, durchsuchbarer Auswahlliste (mobil-tauglich). */
const MaterialCombobox: React.FC<{
  value: string
  options: PickOption[]
  onText: (v: string) => void
  onPick: (o: PickOption) => void
}> = ({ value, options, onText, onPick }) => {
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
    return list.slice(0, 60)
  }, [options, value])

  return (
    <div className="material-combobox">
      <input
        type="text"
        className="material-usage-select"
        placeholder="Material wählen oder eingeben"
        value={value}
        onChange={(e) => {
          onText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Material"
      />
      <button
        type="button"
        className="material-combobox-toggle"
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        aria-label="Liste öffnen"
        tabIndex={-1}
      >
        ▾
      </button>
      {open && filtered.length > 0 && (
        <ul className="material-combobox-list" role="listbox">
          {filtered.map((o, i) => (
            <li
              key={`${o.id || o.name}-${i}`}
              role="option"
              aria-selected={o.name === value}
              className="material-combobox-item"
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(o)
                setOpen(false)
              }}
            >
              <span className="mc-name">{o.name}</span>
              {o.unit ? <span className="mc-unit">{o.unit}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const MaterialUsageFieldsComponent: React.FC<MaterialUsageFieldsProps> = ({
  noMaterial,
  onNoMaterialChange,
  rows,
  onRowsChange,
  offerMaterials
}) => {
  const [types, setTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)

  const hasOffer = !!(offerMaterials && offerMaterials.length > 0)

  useEffect(() => {
    // Bei Angebots-Liste den globalen Katalog nicht laden (nur Angebot + Freitext)
    if (hasOffer) {
      setLoading(false)
      return
    }
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
  }, [hasOffer])

  // Auswahl-Optionen (Angebot bevorzugt, sonst globaler Katalog)
  const options: PickOption[] = useMemo(() => {
    if (hasOffer) {
      return (offerMaterials || []).map((o) => ({
        name: o.name,
        unit: o.unit,
        unitPriceEur: o.unitPriceEur
      }))
    }
    return types.map((t) => ({
      name: t.name,
      unit: t.unitLabel,
      unitPriceEur: t.unitPriceEur,
      id: t.id
    }))
  }, [hasOffer, offerMaterials, types])

  const optionByName = useMemo(() => {
    const map = new Map<string, PickOption>()
    for (const o of options) map.set(o.name.trim().toLowerCase(), o)
    return map
  }, [options])

  const addRow = () => onRowsChange([...rows, newRow()])
  const removeRow = (key: string) => {
    const next = rows.filter((r) => r.key !== key)
    onRowsChange(next.length ? next : [newRow()])
  }
  const patchRow = (key: string, patch: Partial<MaterialUsageRow>) => {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const applyOption = (key: string, o: PickOption) => {
    patchRow(key, {
      label: o.name,
      materialTypeId: o.id || '',
      unit: o.id ? undefined : o.unit,
      unitPriceEur: o.id ? undefined : o.unitPriceEur
    })
  }

  const onText = (key: string, value: string) => {
    const exact = optionByName.get(value.trim().toLowerCase())
    if (exact) {
      applyOption(key, exact)
      patchRow(key, { label: value })
      return
    }
    // Freitext (kein Treffer)
    patchRow(key, { label: value, materialTypeId: '', unit: undefined, unitPriceEur: undefined })
  }

  return (
    <div className="material-usage-fields">
      <h4 className="material-usage-title">Verbrauchsmaterial</h4>
      <p className="material-usage-intro">
        {hasOffer
          ? 'Material aus dem Angebot wählen (Liste öffnen oder tippen zum Filtern) – oder eigenen Text eingeben.'
          : 'Material wählen (Liste öffnen oder tippen zum Filtern) – oder eigenen Text eingeben.'}
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
              <div className="material-usage-rows">
                {rows.map((row) => (
                  <div key={row.key} className="material-usage-row">
                    <MaterialCombobox
                      value={row.label}
                      options={options}
                      onText={(v) => onText(row.key, v)}
                      onPick={(o) => applyOption(row.key, o)}
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
