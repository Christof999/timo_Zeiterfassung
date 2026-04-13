import React, { useState, useEffect } from 'react'
import { getStoredTheme, toggleTheme, type ThemeChoice } from '../utils/theme'
import '../styles/ThemeToggle.css'

interface ThemeToggleProps {
  /** Kurz nur Icon, sonst Icon + Text */
  variant?: 'icon' | 'labeled'
  className?: string
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'icon', className = '' }) => {
  const [theme, setTheme] = useState<ThemeChoice>(() => getStoredTheme())

  useEffect(() => {
    setTheme(getStoredTheme())
  }, [])

  const handleClick = () => {
    const next = toggleTheme()
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus'
  const title = theme === 'dark' ? 'Zum Hellmodus wechseln' : 'Zum Dunkelmodus wechseln'

  return (
    <button
      type="button"
      className={`theme-toggle ${variant === 'labeled' ? 'theme-toggle--labeled' : ''} ${className}`.trim()}
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
      {variant === 'labeled' && <span className="theme-toggle-text">{label}</span>}
    </button>
  )
}

export default ThemeToggle
