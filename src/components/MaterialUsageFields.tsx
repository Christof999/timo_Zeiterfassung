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
  /** true = bewusst gewählte Freitext-Position (sonst nur Auswahl aus dem Katalog/Angebot) */
  freeText?: boolean
}

/** Angebots-Materialposition (kurze, projektbezogene Auswahl beim Einstempeln) */
export type OfferMaterialOption = {
  name: string
  unit?: string
  unitPriceEur?: number
  /** Vorzubelegende (Rest-)Menge aus dem Angebot */
  defaultQuantity?: number
}

/** Vereinheitlichte Auswahl-Option (Angebot oder globaler Katalog) */
export type PickOption = { name: string; unit?: string; unitPriceEur?: number; id?: string; defaultQuantity?: number }

/** Standard-Einheiten zur Auswahl (frei ergänzbar). */
const STANDARD_UNITS = ['Stück', 'Sack', 'kg', 'g', 'qm', 'm²', 'lfm', 'l', 'Eimer', 'Rolle', 'Kartusche']
const UNIT_OPTIONS: PickOption[] = STANDARD_UNITS.map((u) => ({ name: u }))

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
  /** Überschrift (Standard: „Verbrauchsmaterial“). */
  title?: string
  /** Einleitungstext über der Eingabe. */
  intro?: string
  /** „kein Material“-Checkbox ausblenden (z. B. für optionale Gutschrift-Erfassung). */
  hideNoMaterialToggle?: boolean
  /** Beschriftung der „kein Material“-Checkbox (Standard: Tagesbezug beim Ausstempeln). */
  noMaterialLabel?: string
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
export const MaterialCombobox: React.FC<{
  value: string
  options: PickOption[]
  onText: (v: string) => void
  onPick: (o: PickOption) => void
  placeholder?: string
  className?: string
}> = ({ value, options, onText, onPick, placeholder, className }) => {
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
    return list.slice(0, 60)
  }, [options, value])

  return (
    <div className={`material-combobox ${className || ''}`}>
      <input
        type="text"
        className="material-usage-select"
        placeholder={placeholder || 'Material wählen oder eingeben'}
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

/**
 * Auswahl-basiertes Materialfeld: nur Katalog-/Angebotspositionen sind gültig.
 * Freies Tippen dient nur dem Filtern und wird beim Verlassen verworfen – eine
 * echte Freitext-Position gibt es nur über die gesonderte, ans Listenende
 * gepinnte Option „Material freitext". Das hält die Nachkalkulation sauber.
 */
const MaterialSelect: React.FC<{
  value: string
  options: PickOption[]
  onPick: (o: PickOption) => void
  onPickFreeText: () => void
  placeholder?: string
}> = ({ value, options, onPick, onPickFreeText, placeholder }) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)

  // Committete Auswahl von außen (z. B. Vorbelegung) in das Suchfeld spiegeln.
  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
    return list.slice(0, 60)
  }, [options, query])

  return (
    <div className="material-combobox">
      <input
        type="text"
        className="material-usage-select"
        placeholder={placeholder || 'Material aus Liste wählen'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // Nicht bestätigte Eingabe verwerfen: zurück auf die committete Auswahl.
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(value) }, 150)}
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
      {open && (
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
          {filtered.length === 0 && (
            <li className="material-combobox-empty" role="presentation">
              Kein Treffer in der Liste
            </li>
          )}
          {/* Bewusste Freitext-Eingabe – immer ganz am Ende der Liste. */}
          <li
            role="option"
            aria-selected={false}
            className="material-combobox-item material-combobox-freetext"
            onMouseDown={(e) => {
              e.preventDefault()
              onPickFreeText()
              setOpen(false)
            }}
          >
            <span className="mc-name">✎ Material freitext</span>
          </li>
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
  offerMaterials,
  title,
  intro,
  hideNoMaterialToggle,
  noMaterialLabel
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
        unitPriceEur: o.unitPriceEur,
        defaultQuantity: o.defaultQuantity
      }))
    }
    return types.map((t) => ({
      name: t.name,
      unit: t.unitLabel,
      unitPriceEur: t.unitPriceEur,
      id: t.id
    }))
  }, [hasOffer, offerMaterials, types])

  const addRow = () => onRowsChange([...rows, newRow()])
  const removeRow = (key: string) => {
    const next = rows.filter((r) => r.key !== key)
    onRowsChange(next.length ? next : [newRow()])
  }
  const patchRow = (key: string, patch: Partial<MaterialUsageRow>) => {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const formatQty = (n: number): string => String(Math.round(n * 1000) / 1000)

  const applyOption = (key: string, o: PickOption) => {
    const patch: Partial<MaterialUsageRow> = {
      label: o.name,
      materialTypeId: o.id || '',
      unit: o.id ? undefined : o.unit,
      unitPriceEur: o.id ? undefined : o.unitPriceEur,
      freeText: false
    }
    // Angebots-(Rest-)Menge vorbelegen; Mitarbeiter kann sie überschreiben
    if (typeof o.defaultQuantity === 'number') {
      patch.quantity = formatQty(o.defaultQuantity)
    }
    patchRow(key, patch)
  }

  // Bewusst gewählte Freitext-Position: Feld leeren und in den Freitext-Modus schalten.
  const enterFreeText = (key: string) =>
    patchRow(key, { freeText: true, label: '', materialTypeId: '', unitPriceEur: undefined })

  // Zurück zur Auswahl aus dem Katalog/Angebot.
  const exitFreeText = (key: string) =>
    patchRow(key, { freeText: false, label: '', materialTypeId: '', unit: undefined, unitPriceEur: undefined })

  const onUnitText = (key: string, value: string) => patchRow(key, { unit: value })
  const onUnitPick = (key: string, o: PickOption) => patchRow(key, { unit: o.name })

  const showRows = hideNoMaterialToggle ? true : !noMaterial

  return (
    <div className="material-usage-fields">
      {/* Leerer String blendet die Überschrift bewusst aus (Aufrufer setzt eigene). */}
      {title !== '' && <h4 className="material-usage-title">{title || 'Verbrauchsmaterial'}</h4>}
      <p className="material-usage-intro">
        {intro ||
          (hasOffer
            ? 'Material aus dem Angebot wählen (Liste öffnen oder tippen zum Filtern). Für nicht gelistetes Material: „Material freitext" am Ende der Liste.'
            : 'Material aus der Liste wählen (Liste öffnen oder tippen zum Filtern). Für nicht gelistetes Material: „Material freitext" am Ende der Liste.')}
      </p>

      {!hideNoMaterialToggle && (
        <label className="material-usage-no-material">
          <input
            type="checkbox"
            checked={noMaterial}
            onChange={(e) => onNoMaterialChange(e.target.checked)}
          />
          <span>{noMaterialLabel || 'Heute wurde kein Verbrauchsmaterial verbucht'}</span>
        </label>
      )}

      {showRows && (
        <>
          {loading ? (
            <p className="material-usage-loading">Materialarten werden geladen…</p>
          ) : (
            <>
              <div className="material-usage-rows">
                {rows.map((row) => (
                  <div key={row.key} className="material-usage-row">
                    {row.freeText ? (
                      <div className="material-freetext-field">
                        <input
                          type="text"
                          className="material-usage-select"
                          placeholder="Material (Freitext)"
                          value={row.label}
                          onChange={(e) => patchRow(row.key, { label: e.target.value })}
                          aria-label="Material (Freitext)"
                          autoFocus
                        />
                        <button
                          type="button"
                          className="material-freetext-back"
                          onClick={() => exitFreeText(row.key)}
                          title="Zurück zur Auswahl aus der Liste"
                        >
                          Aus Liste wählen
                        </button>
                      </div>
                    ) : (
                      <MaterialSelect
                        value={row.label}
                        options={options}
                        onPick={(o) => applyOption(row.key, o)}
                        onPickFreeText={() => enterFreeText(row.key)}
                      />
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      className="material-usage-qty"
                      placeholder="Menge"
                      value={row.quantity}
                      onChange={(e) => patchRow(row.key, { quantity: e.target.value })}
                      aria-label="Menge"
                    />
                    <MaterialCombobox
                      value={row.unit || ''}
                      options={UNIT_OPTIONS}
                      onText={(v) => onUnitText(row.key, v)}
                      onPick={(o) => onUnitPick(row.key, o)}
                      placeholder="Einheit"
                      className="material-combobox-unit"
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
