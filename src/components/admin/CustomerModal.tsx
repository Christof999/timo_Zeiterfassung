import { useState, useEffect } from 'react'
import { DataService } from '../../services/dataService'
import type { Customer } from '../../types'
import { toast } from '../ToastContainer'
import '../../styles/Modal.css'

interface CustomerModalProps {
  customer: Customer | null
  onClose: () => void
  onSave: () => void
}

const buildDisplayName = (data: {
  companyName: string
  firstName: string
  lastName: string
}): string => {
  const company = data.companyName.trim()
  if (company) return company
  return [data.firstName.trim(), data.lastName.trim()].filter(Boolean).join(' ').trim()
}

const CustomerModal: React.FC<CustomerModalProps> = ({ customer, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    isActive: true
  })
  const [isLoading, setIsLoading] = useState(false)

  const isHeroCustomer = customer?.source === 'hero'

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        companyName: customer.companyName || '',
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        notes: customer.notes || '',
        isActive: customer.isActive !== false
      })
    }
  }, [customer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const name = formData.name.trim() || buildDisplayName(formData)
      if (!name) {
        toast.error('Bitte einen Namen oder eine Firma angeben.')
        setIsLoading(false)
        return
      }

      const customerData: Partial<Customer> = {
        name,
        companyName: formData.companyName.trim() || undefined,
        firstName: formData.firstName.trim() || undefined,
        lastName: formData.lastName.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        isActive: formData.isActive
      }

      if (customer?.id) {
        await DataService.updateCustomer(customer.id, customerData)
        toast.success('Kunde erfolgreich aktualisiert')
      } else {
        await DataService.createCustomer({ ...customerData, source: 'manual' })
        toast.success('Kunde erfolgreich erstellt')
      }

      onSave()
    } catch (error: any) {
      toast.error('Fehler: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{customer ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {isHeroCustomer && (
            <p className="form-hint" style={{ marginTop: 0 }}>
              Dieser Kunde stammt aus HERO. Änderungen können beim nächsten Sync überschrieben werden.
            </p>
          )}
          <div className="form-group">
            <label>Anzeigename:</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Firma oder Name (leer = aus Feldern unten)"
            />
          </div>
          <div className="form-group">
            <label>Firma:</label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Vorname:</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Nachname:</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>E-Mail:</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Telefon:</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Adresse:</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="z.B. Musterstraße 123, 12345 Stadt"
            />
          </div>
          <div className="form-group">
            <label>Notizen:</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Status:</label>
            <select
              value={formData.isActive ? 'active' : 'inactive'}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn secondary-btn">
              Abbrechen
            </button>
            <button type="submit" className="btn primary-btn" disabled={isLoading}>
              {isLoading ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CustomerModal
