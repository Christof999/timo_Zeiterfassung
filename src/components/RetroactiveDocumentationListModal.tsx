import React, { useState, useEffect, useCallback } from 'react'
import { DataService } from '../services/dataService'
import type { TimeEntry, Project, Employee } from '../types'
import { Timestamp } from 'firebase/firestore'
import AppendDocumentationModal from './AppendDocumentationModal'
import { collectEntryDocumentation } from '../utils/entryDocumentation'
import '../styles/Modal.css'
import '../styles/RetroactiveDocumentationModal.css'

interface RetroactiveDocumentationListModalProps {
  employee: Employee
  onClose: () => void
  onDocumentationSaved: () => void
}

function toDate(value: TimeEntry['clockInTime']): Date | null {
  if (!value) return null
  try {
    if (value instanceof Date) return value
    if (value instanceof Timestamp) return value.toDate()
    if ((value as any)?.toDate && typeof (value as any).toDate === 'function') {
      return (value as any).toDate()
    }
    const d = new Date(value as any)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

const RetroactiveDocumentationListModal: React.FC<RetroactiveDocumentationListModalProps> = ({
  employee,
  onClose,
  onDocumentationSaved
}) => {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)

  const loadEntries = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setIsLoading(true)
      try {
        const [allEntries, allProjects] = await Promise.all([
          DataService.getTimeEntriesByEmployeeId(employee.id!),
          DataService.getAllProjects()
        ])
        setProjects(allProjects)

        const completed = allEntries.filter((e) => {
          if (e.isVacationDay) return false
          const out = e.clockOutTime
          if (out == null) return false
          if (out instanceof Timestamp) return true
          if (out instanceof Date) return true
          return true
        })

        completed.sort((a, b) => {
          const da = toDate(a.clockInTime)?.getTime() ?? 0
          const db = toDate(b.clockInTime)?.getTime() ?? 0
          return db - da
        })

        setEntries(completed)
      } catch (err) {
        console.error('Fehler beim Laden der Zeiteinträge:', err)
      } finally {
        if (showSpinner) setIsLoading(false)
      }
    },
    [employee.id]
  )

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const projectName = (projectId: string): string => {
    const p = projects.find((x) => x.id === projectId)
    return p?.name || 'Unbekanntes Projekt'
  }

  const reportPreview = (entry: TimeEntry): string => {
    const text = collectEntryDocumentation(entry).replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > 140 ? `${text.slice(0, 140)}…` : text
  }

  const entryBadges = (entry: TimeEntry): string[] => {
    const badges: string[] = []
    const materialCount = entry.materialUsages?.length ?? 0
    if (materialCount > 0) badges.push(`${materialCount}× Material`)
    const photoCount =
      (entry.sitePhotoUploads?.length ?? 0) + (entry.documentPhotoUploads?.length ?? 0)
    if (photoCount > 0) badges.push(`${photoCount} Foto/Beleg`)
    return badges
  }

  const formatDay = (entry: TimeEntry): string => {
    const d = toDate(entry.clockInTime)
    return d
      ? d.toLocaleDateString('de-DE', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : '—'
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content retro-doc-list-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Meine Einträge</h3>
            <button type="button" className="close-modal-btn" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="form-hint retro-doc-list-intro">
              Ihre abgeschlossenen Zeiteinträge mit Projekt. Tippen Sie auf einen Eintrag, um
              gebuchtes Material und Dokumentation anzusehen, zu korrigieren oder nachzutragen.
            </p>

            {isLoading ? (
              <p className="retro-doc-list-loading">Lade Einträge…</p>
            ) : entries.length === 0 ? (
              <p className="no-data">Keine abgeschlossenen Zeiteinträge vorhanden.</p>
            ) : (
              <ul className="retro-doc-entry-list">
                {entries.map((entry) => {
                  const preview = reportPreview(entry)
                  const badges = entryBadges(entry)
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="retro-doc-entry-row"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <span className="retro-doc-entry-main">
                          <span className="retro-doc-entry-head">
                            <span className="retro-doc-entry-date">{formatDay(entry)}</span>
                            <span className="retro-doc-entry-project">{projectName(entry.projectId)}</span>
                          </span>
                          {preview ? (
                            <span className="retro-doc-entry-preview">{preview}</span>
                          ) : (
                            <span className="retro-doc-entry-preview is-empty">
                              Noch kein Bericht – tippen zum Nachtragen
                            </span>
                          )}
                          {badges.length > 0 && (
                            <span className="retro-doc-entry-badges">
                              {badges.map((b) => (
                                <span key={b} className="retro-doc-entry-badge">
                                  {b}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="retro-doc-entry-chevron" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {selectedEntry && (
        <AppendDocumentationModal
          timeEntry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onSaved={() => {
            // Nur die Liste im Hintergrund auffrischen (Badges/Vorschau) — das
            // Detail-Modal bleibt offen; der Haupt-Speichern-Button schließt selbst.
            onDocumentationSaved()
            loadEntries(false)
          }}
        />
      )}
    </>
  )
}

export default RetroactiveDocumentationListModal
