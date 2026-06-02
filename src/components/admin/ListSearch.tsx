import React from 'react'
import '../../styles/AdminTabs.css'

interface ListSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const ListSearch: React.FC<ListSearchProps> = ({ value, onChange, placeholder }) => {
  return (
    <div className="list-search">
      <span className="list-search-icon" aria-hidden="true">🔍</span>
      <input
        type="search"
        className="list-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Suchen...'}
        aria-label={placeholder || 'Suchen'}
      />
      {value && (
        <button
          type="button"
          className="list-search-clear"
          onClick={() => onChange('')}
          aria-label="Suche zurücksetzen"
          title="Suche zurücksetzen"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default ListSearch
