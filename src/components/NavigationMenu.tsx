import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/NavigationMenu.css'

interface NavigationMenuProps {
  onLogout: () => void
}

const NavigationMenu: React.FC<NavigationMenuProps> = ({ onLogout }) => {
  const [isOpen, setIsOpen] = useState(false)

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleOverlayClick = () => {
    setIsOpen(false)
  }

  return (
    <>
      <button 
        className="nav-toggle" 
        onClick={() => setIsOpen(true)}
        aria-label="Navigation umschalten"
        aria-expanded={isOpen}
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      <nav className={`nav-menu ${isOpen ? 'active' : ''}`} aria-hidden={!isOpen}>
        <button 
          className="nav-menu-close" 
          onClick={() => setIsOpen(false)}
          aria-label="Menü schließen"
        >
          ×
        </button>
        <Link 
          to="/vacation" 
          className="nav-item btn primary-btn" 
          onClick={() => setIsOpen(false)}
        >
          📅 Urlaubsanträge
        </Link>
        <button 
          onClick={() => {
            setIsOpen(false)
            onLogout()
          }} 
          className="nav-item btn secondary-btn"
        >
          🚪 Abmelden
        </button>
      </nav>

      {isOpen && (
        <div 
          className={`nav-overlay ${isOpen ? 'active' : ''}`} 
          onClick={handleOverlayClick}
          aria-hidden="true"
        />
      )}
    </>
  )
}

export default NavigationMenu
