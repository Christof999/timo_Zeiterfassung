import { useState, useEffect } from 'react'
import { DataService } from '../../../services/dataService'
import type { Employee } from '../../../types'
import { toast } from '../../ToastContainer'
import EmployeeModal from '../EmployeeModal'
import '../../../styles/AdminTabs.css'

const EmployeesTab: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  useEffect(() => {
    loadEmployees()
  }, [])

  const loadEmployees = async () => {
    try {
      const allEmployees = await DataService.getAllActiveEmployees()
      setEmployees(allEmployees)
    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter:', error)
      toast.error('Fehler beim Laden der Mitarbeiter')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingEmployee(null)
    setShowModal(true)
  }

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Mitarbeiter wirklich löschen?')) {
      return
    }

    try {
      await DataService.deleteEmployee(id)
      toast.success('Mitarbeiter erfolgreich gelöscht')
      loadEmployees()
    } catch (error: any) {
      toast.error('Fehler beim Löschen: ' + error.message)
    }
  }

  const handleSave = () => {
    setShowModal(false)
    setEditingEmployee(null)
    loadEmployees()
  }

  if (isLoading) {
    return <div className="loading">Lade Mitarbeiter...</div>
  }

  return (
    <div className="employees-tab">
      <div className="tab-header">
        <h3>Mitarbeiter</h3>
        <button onClick={handleAdd} className="btn primary-btn">
          ➕ Mitarbeiter hinzufügen
        </button>
      </div>

      {employees.length === 0 ? (
        <p className="no-data">Keine Mitarbeiter vorhanden</p>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Benutzername</th>
                <th>Position</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.name || `${employee.firstName} ${employee.lastName}`}</td>
                  <td>{employee.username}</td>
                  <td>{employee.position || '-'}</td>
                  <td>
                    <span className={`status-badge ${employee.status === 'active' ? 'active' : 'inactive'}`}>
                      {employee.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="action-buttons">
                    <button 
                      onClick={() => handleEdit(employee)} 
                      className="action-btn edit-btn"
                      aria-label="Bearbeiten"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => handleDelete(employee.id!)} 
                      className="action-btn delete-btn"
                      aria-label="Löschen"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <EmployeeModal
          employee={editingEmployee}
          onClose={() => {
            setShowModal(false)
            setEditingEmployee(null)
          }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

export default EmployeesTab

