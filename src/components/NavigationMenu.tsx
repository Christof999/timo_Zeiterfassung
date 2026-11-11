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

  const close = () => setIsOpen(false)

  return (
    <>
      <button
        className="nav-toggle"
        onClick={() => setIsOpen(true)}
        aria-label="Menü öffnen"
        aria-expanded={isOpen}
      >
        <span className="nav-hamburger-line"></span>
        <span className="nav-hamburger-line"></span>
        <span className="nav-hamburger-line"></span>
      </button>

      <nav className={`nav-menu nav-menu--employee ${isOpen ? 'active' : ''}`} aria-label="Mitarbeitermen?" inert={!isOpen}>
        <div className="nav-menu-head"><strong>Menü</strong><button type="button" className="nav-menu-close" onClick={close} aria-label="Menü schließen">×</button></div>
        <Link to="/time-tracking" className="nav-item" onClick={close}>Zeiterfassung</Link>
        <Link to="/aufmass" className="nav-item" onClick={close}>Aufmaß</Link>
        <Link to="/vacation" className="nav-item" onClick={close}>Urlaubsanträge</Link>
        <Link to="/overtime" className="nav-item" onClick={close}>Überstunden verrechnen</Link>
        <button onClick={() => { close(); onLogout() }} className="nav-item nav-item-logout">Abmelden</button>
      </nav>

      {isOpen && (
        <div 
          className={`nav-overlay ${isOpen ? 'active' : ''}`} 
          onClick={close}
          aria-hidden="true"
        />
      )}
    </>
  )
}

export default NavigationMenu
