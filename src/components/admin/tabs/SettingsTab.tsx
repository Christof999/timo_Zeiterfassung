import { useEffect, useState } from 'react'
import { isRegieZettelEnabled, setRegieZettelEnabled } from '../../../services/regieSettingsService'
import { toast } from '../../ToastContainer'
import '../../../styles/AdminTabs.css'

const SettingsTab: React.FC = () => {
  const [regieEnabled, setRegieEnabled] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    isRegieZettelEnabled().then(setRegieEnabled)
  }, [])

  const toggleRegie = async (enabled: boolean) => {
    setIsSaving(true)
    try {
      await setRegieZettelEnabled(enabled)
      setRegieEnabled(enabled)
      toast.success(enabled ? 'Regiezettel wird ausgeliefert.' : 'Regiezettel ist ausgeschaltet.')
    } catch (error) {
      console.error('Fehler beim Speichern der Regiezettel-Einstellung:', error)
      toast.error('Einstellung konnte nicht gespeichert werden.')
    } finally {
      setIsSaving(false)
    }
  }

  if (regieEnabled === null) {
    return <div className="loading">Lade Einstellungen...</div>
  }

  return (
    <div className="settings-tab">
      <div className="tab-header">
        <h2>Einstellungen</h2>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={regieEnabled}
            disabled={isSaving}
            onChange={(e) => toggleRegie(e.target.checked)}
            style={{ width: 'auto', minHeight: 0 }}
          />
          Regiezettel ausliefern
        </label>
        <small className="form-hint">
          Wenn eingeschaltet, bekommen Mitarbeiter nach dem Ausstempeln auf einer Baustelle den
          Regiezettel des Tages angezeigt, den der Kunde unterschreiben kann. Der Ausdruck in der
          Nachkalkulation steht dem Admin immer zur Verfügung.
        </small>
      </div>
    </div>
  )
}

export default SettingsTab
