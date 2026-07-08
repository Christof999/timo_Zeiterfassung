import React, { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { MaterialType } from '../../types'
import { toast } from '../ToastContainer'
import '../../styles/Modal.css'

interface MaterialTypeModalProps {
  item: MaterialType | null
  onClose: () => void
  onSave: () => void
}

const MaterialTypeModal: React.FC<MaterialTypeModalProps> = ({ item, onClose, onSave }) => {
  const [name, setName] = useState('')
  const [unitLabel, setUnitLabel] = useState('m²')
  const [unitPriceEur, setUnitPriceEur] = useState('')
  const [purchasePriceEur, setPurchasePriceEur] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (item) {
      setName(item.name || '')
      setUnitLabel(item.unitLabel || 'm²')
      setUnitPriceEur(typeof item.unitPriceEur === 'number' ? String(item.unitPriceEur) : '')
      setPurchasePriceEur(typeof item.purchasePriceEur === 'number' ? String(item.purchasePriceEur) : '')
      setSortOrder(String(item.sortOrder ?? 0))
      setIsActive(item.isActive !== false)
    } else {
      setName('')
      setUnitLabel('m²')
      setUnitPriceEur('')
      setPurchasePriceEur('')
      setSortOrder('0')
      setIsActive(true)
    }
  }, [item])

  const parsePrice = (value: string): number | null => {
    const v = value.trim()
    if (v === '') return null
    const n = Number.parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : NaN
  }

  // Live-Marge-Vorschau (Verkauf − Einkauf) pro Einheit
  const sale = parsePrice(unitPriceEur)
  const purchase = parsePrice(purchasePriceEur)
  const marginPreview =
    typeof sale === 'number' &&
    Number.isFinite(sale) &&
    typeof purchase === 'number' &&
    Number.isFinite(purchase)
      ? sale - purchase
      : null
  const marginPct =
    marginPreview != null && typeof sale === 'number' && sale > 0
      ? (marginPreview / sale) * 100
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Bitte einen Namen eingeben.')
      return
    }
    setIsLoading(true)
    try {
      const price = unitPriceEur.trim() === '' ? undefined : Number.parseFloat(unitPriceEur.replace(',', '.'))
      if (unitPriceEur.trim() !== '' && (!Number.isFinite(price!) || (price as number) < 0)) {
        toast.error('Ungültiger Verkaufspreis.')
        setIsLoading(false)
        return
      }
      const purchase =
        purchasePriceEur.trim() === '' ? undefined : Number.parseFloat(purchasePriceEur.replace(',', '.'))
      if (purchasePriceEur.trim() !== '' && (!Number.isFinite(purchase!) || (purchase as number) < 0)) {
        toast.error('Ungültiger Einkaufspreis.')
        setIsLoading(false)
        return
      }
      const so = Number.parseInt(sortOrder, 10)
      const payload: Partial<MaterialType> = {
        name: name.trim(),
        unitLabel: unitLabel.trim() || 'm²',
        unitPriceEur: price,
        purchasePriceEur: purchase,
        sortOrder: Number.isFinite(so) ? so : 0,
        isActive
      }
      if (item?.id) {
        await DataService.updateMaterialType(item.id, payload)
        toast.success('Material gespeichert')
      } else {
        await DataService.createMaterialType(payload)
        toast.success('Material angelegt')
      }
      onSave()
    } catch (err: any) {
      toast.error(err?.message || 'Speichern fehlgeschlagen')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{item ? 'Material bearbeiten' : 'Neues Material'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mt-name">Bezeichnung</label>
            <input
              id="mt-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="z. B. Bodenfliese 60×60"
            />
          </div>
          <div className="form-group">
            <label htmlFor="mt-unit">Mengeneinheit</label>
            <input
              id="mt-unit"
              type="text"
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="m², Stück, Sack …"
            />
          </div>
          <div className="form-group">
            <label htmlFor="mt-price">Verkaufspreis pro Einheit (EUR, optional)</label>
            <input
              id="mt-price"
              type="text"
              inputMode="decimal"
              value={unitPriceEur}
              onChange={(e) => setUnitPriceEur(e.target.value)}
              placeholder="z. B. 24,50"
            />
          </div>
          <div className="form-group">
            <label htmlFor="mt-purchase">Einkaufspreis pro Einheit (EUR, optional)</label>
            <input
              id="mt-purchase"
              type="text"
              inputMode="decimal"
              value={purchasePriceEur}
              onChange={(e) => setPurchasePriceEur(e.target.value)}
              placeholder="z. B. 16,80"
            />
            <p className="form-hint" style={{ margin: '4px 0 0' }}>
              Nur intern (Admin & Nachkalkulation) – wird Mitarbeitern nicht angezeigt.
            </p>
          </div>
          {marginPreview != null && (
            <div className={`material-margin-preview ${marginPreview < 0 ? 'is-negative' : ''}`}>
              <span>Marge pro Einheit</span>
              <strong>
                {marginPreview.toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR'
                })}
                {marginPct != null ? ` · ${marginPct.toFixed(0)} %` : ''}
              </strong>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="mt-sort">Sortierung (klein = oben)</label>
            <input
              id="mt-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />{' '}
              Aktiv (in Auswahl für Mitarbeiter)
            </label>
          </div>
          <div className="form-group text-center">
            <button type="submit" className="btn primary-btn" disabled={isLoading}>
              {isLoading ? 'Speichere…' : 'Speichern'}
            </button>
            <button type="button" className="btn secondary-btn" onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MaterialTypeModal
