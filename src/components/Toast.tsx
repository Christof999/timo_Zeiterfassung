import { useEffect } from 'react'
import '../styles/Toast.css'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 4000,
  onClose 
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`toast toast-${type}`} role="alert">
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' && '✅'}
          {type === 'error' && '❌'}
          {type === 'info' && 'ℹ️'}
        </span>
        <span className="toast-message">{message}</span>
      </div>
      <button 
        className="toast-close" 
        onClick={onClose}
        aria-label="Schließen"
      >
        ×
      </button>
    </div>
  )
}

export default Toast

