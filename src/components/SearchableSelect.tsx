import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/SearchableSelect.css'

export interface SearchableOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  id?: string
}

/**
 * Auswahlfeld mit integrierter Suche: antippen öffnet ein Panel mit Suchzeile
 * (oben) und einer Liste (darunter), die beim Tippen live gefiltert wird.
 * Reine Auswahl aus der Liste (kein Freitext).
 */
const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Bitte wählen',
  searchPlaceholder = 'Suchen…',
  emptyText = 'Kein Ergebnis',
  id
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  // Schließen, wenn außerhalb getippt wird
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  // Beim Öffnen Suche zurücksetzen und fokussieren
  useEffect(() => {
    if (open) {
      setQuery('')
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const select = (val: string) => {
    onChange(val)
    setOpen(false)
  }

  return (
    <div className={`searchable-select ${open ? 'open' : ''}`} ref={containerRef}>
      <button
        type="button"
        id={id}
        className="searchable-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'searchable-select-value' : 'searchable-select-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="searchable-select-arrow" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="searchable-select-panel">
          <input
            ref={inputRef}
            type="text"
            className="searchable-select-search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <ul className="searchable-select-list" role="listbox">
            {filtered.length === 0 ? (
              <li className="searchable-select-empty">{emptyText}</li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={`searchable-select-item ${o.value === value ? 'selected' : ''}`}
                  onClick={() => select(o.value)}
                >
                  {o.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
