import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import { heroService } from '../../../services/heroService'
import type { Customer } from '../../../types'
import { toast } from '../../ToastContainer'
import CustomerModal from '../CustomerModal'
import '../../../styles/AdminTabs.css'

const CustomersTab: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      const allCustomers = await DataService.getAllCustomers()
      setCustomers(allCustomers)
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error)
      toast.error('Fehler beim Laden der Kunden')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingCustomer(null)
    setShowModal(true)
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setShowModal(true)
  }

  const handleSave = () => {
    setShowModal(false)
    setEditingCustomer(null)
    loadCustomers()
  }

  const handleDelete = async (customer: Customer) => {
    if (!customer.id) return
    if (!confirm(`Kunde "${customer.name}" wirklich löschen?`)) {
      return
    }

    setDeletingCustomerId(customer.id)
    try {
      await DataService.deleteCustomer(customer.id)
      toast.success('Kunde gelöscht')
      await loadCustomers()
    } catch (error: any) {
      toast.error('Fehler beim Löschen: ' + error.message)
    } finally {
      setDeletingCustomerId(null)
    }
  }

  const handleHeroSync = async () => {
    setIsSyncing(true)
    try {
      const result = await heroService.syncCustomers()
      const stats = result.stats
      toast.success(
        stats
          ? `Kunden-Sync: ${stats.created} neu, ${stats.updated} aktualisiert.`
          : 'Kunden aus HERO synchronisiert.'
      )
      await loadCustomers()
    } catch (error: any) {
      toast.error('HERO-Kunden-Sync fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'))
    } finally {
      setIsSyncing(false)
    }
  }

  if (isLoading) {
    return <div className="loading">Lade Kunden...</div>
  }

  return (
    <div className="customers-tab">
      <div className="tab-header">
        <h3>Kunden</h3>
        <div className="tab-header-actions">
          <button onClick={handleHeroSync} className="btn secondary-btn" disabled={isSyncing}>
            {isSyncing ? 'Synchronisiere…' : 'Aus HERO synchronisieren'}
          </button>
          <button onClick={handleAdd} className="btn primary-btn">
            Kunde hinzufügen
          </button>
        </div>
      </div>

      {customers.length === 0 ? (
        <p className="no-data">Keine Kunden vorhanden</p>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kontakt</th>
                <th>Adresse</th>
                <th>Quelle</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td data-label="Name">{customer.name}</td>
                  <td data-label="Kontakt">
                    {customer.email || customer.phone || '-'}
                  </td>
                  <td data-label="Adresse">{customer.address || '-'}</td>
                  <td data-label="Quelle">
                    <span className={`status-badge ${customer.source === 'hero' ? 'active' : 'inactive'}`}>
                      {customer.source === 'hero' ? 'HERO' : 'Manuell'}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={`status-badge ${customer.isActive !== false ? 'active' : 'inactive'}`}>
                      {customer.isActive !== false ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="action-buttons" data-label="">
                    <button
                      onClick={() => handleEdit(customer)}
                      className="action-btn edit-btn"
                      aria-label="Bearbeiten"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => handleDelete(customer)}
                      className="action-btn delete-btn"
                      aria-label="Löschen"
                      disabled={deletingCustomerId === customer.id}
                      title="Kunde löschen"
                    >
                      {deletingCustomerId === customer.id ? 'Löscht...' : 'Löschen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => {
            setShowModal(false)
            setEditingCustomer(null)
          }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

export default CustomersTab
