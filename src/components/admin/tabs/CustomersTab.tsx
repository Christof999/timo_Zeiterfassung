import { useState, useEffect, useMemo } from 'react'
import { DataService } from '../../../services/dataService'
import type { Customer } from '../../../types'
import { toast } from '../../ToastContainer'
import ListSearch from '../ListSearch'
import '../../../styles/AdminTabs.css'

/**
 * Kundenstamm – nur zur Ansicht. Angelegt und gepflegt werden Kunden im
 * Rechnungsprogramm; die Zeiterfassung liest dieselbe Liste.
 */
const CustomersTab: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    DataService.getAllCustomers()
      .then(setCustomers)
      .catch((error) => {
        console.error('Fehler beim Laden der Kunden:', error)
        toast.error('Kunden konnten nicht aus dem Rechnungsprogramm geladen werden')
      })
      .finally(() => setIsLoading(false))
  }, [])

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((c) =>
      [c.name, c.customerNumber, c.email, c.phone, c.address, c.siteAddress]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    )
  }, [customers, searchTerm])

  if (isLoading) {
    return <div className="loading">Lade Kunden...</div>
  }

  return (
    <div className="customers-tab">
      <div className="tab-header">
        <div>
          <h3>Kunden</h3>
          <p className="no-data" style={{ marginTop: 4, marginBottom: 0 }}>
            Die Kunden kommen aus dem Rechnungsprogramm und werden dort angelegt und geändert.
          </p>
        </div>
      </div>

      <ListSearch
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Kunde suchen (Name, Nummer, Adresse)"
      />

      {customers.length === 0 ? (
        <p className="no-data">Keine Kunden vorhanden</p>
      ) : filteredCustomers.length === 0 ? (
        <p className="no-data">Kein Kunde passt zur Suche</p>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Name</th>
                <th>Kontakt</th>
                <th>Adresse</th>
                <th>Baustelle</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td data-label="Nr.">{customer.customerNumber || '-'}</td>
                  <td data-label="Name">{customer.name}</td>
                  <td data-label="Kontakt">{customer.email || customer.phone || '-'}</td>
                  <td data-label="Adresse">{customer.address || '-'}</td>
                  <td data-label="Baustelle">
                    {customer.siteAddress && customer.siteAddress !== customer.address
                      ? customer.siteAddress
                      : '-'}
                  </td>
                  <td data-label="Status">
                    <span className={`status-badge ${customer.isActive !== false ? 'active' : 'inactive'}`}>
                      {customer.isActive !== false ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default CustomersTab
