import { useState, useCallback, useEffect } from 'react'
import Toast from './Toast'
import '../styles/Toast.css'

interface ToastData {
  id: string
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
}

let toastId = 0
let toastListeners: Array<(toasts: ToastData[]) => void> = []
let toasts: ToastData[] = []

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...toasts]))
}

export const toast = {
  success: (message: string, duration?: number) => {
    const id = `toast-${++toastId}`
    toasts.push({ id, message, type: 'success', duration })
    notifyListeners()
  },
  error: (message: string, duration?: number) => {
    const id = `toast-${++toastId}`
    toasts.push({ id, message, type: 'error', duration: duration || 6000 })
    notifyListeners()
  },
  info: (message: string, duration?: number) => {
    const id = `toast-${++toastId}`
    toasts.push({ id, message, type: 'info', duration })
    notifyListeners()
  }
}

const ToastContainer: React.FC = () => {
  const [currentToasts, setCurrentToasts] = useState<ToastData[]>([])

  const removeToast = useCallback((id: string) => {
    toasts = toasts.filter(t => t.id !== id)
    notifyListeners()
  }, [])

  useEffect(() => {
    const listener = (newToasts: ToastData[]) => {
      setCurrentToasts(newToasts)
    }
    toastListeners.push(listener)
    setCurrentToasts([...toasts])

    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
    }
  }, [])

  if (currentToasts.length === 0) return null

  return (
    <div className="toast-container">
      {currentToasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}

export default ToastContainer

