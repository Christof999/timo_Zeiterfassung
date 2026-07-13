import React, { useState, useEffect, useCallback } from 'react'
import { DataService } from '../../../services/dataService'
import type {
  TimeEntry,
  Employee,
  Project,
  MaterialType,
  DashboardWidgetInstance,
  DashboardWidgetSize
} from '../../../types'
import { toast } from '../../ToastContainer'
import EmployeeModal from '../EmployeeModal'
import ProjectModal from '../ProjectModal'
import CustomerModal from '../CustomerModal'
import MaterialTypeModal from '../MaterialTypeModal'
import VehicleModal from '../VehicleModal'
import DailyReportModal from '../DailyReportModal'
import AddWidgetModal from './AddWidgetModal'
import { getWidgetDef, DEFAULT_WIDGET_KEYS } from './widgetRegistry'
import type { DashboardContext, DashboardModalKey, DashboardTabKey, LiveActivity } from './types'
import '../../../styles/Dashboard.css'

interface DashboardTabProps {
  admin: { id?: string; username: string; name: string }
  onNavigate: (tab: DashboardTabKey) => void
}

const genId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `w-${Date.now()}-${Math.random().toString(36).slice(2)}`

const SIZE_CYCLE: DashboardWidgetSize[] = ['small', 'medium', 'large']
const SIZE_LABEL: Record<DashboardWidgetSize, string> = { small: 'S', medium: 'M', large: 'L' }

const buildDefaultLayout = (): DashboardWidgetInstance[] =>
  DEFAULT_WIDGET_KEYS.map((key) => ({
    instanceId: genId(),
    key,
    size: getWidgetDef(key)?.defaultSize || 'small'
  }))

const DashboardTab: React.FC<DashboardTabProps> = ({ admin, onNavigate }) => {
  const adminKey = admin.id || admin.username

  // --- Live-Daten ---
  const [clockedInCount, setClockedInCount] = useState(0)
  const [activeProjectsCount, setActiveProjectsCount] = useState(0)
  const [totalEmployees, setTotalEmployees] = useState(0)
  const [todayHours, setTodayHours] = useState('0.00')
  const [openVacationCount, setOpenVacationCount] = useState(0)
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([])
  const [nowTick, setNowTick] = useState(Date.now())
  const [clockingOutId, setClockingOutId] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)

  // Für das Tagesbericht-Modal
  const [todaysEntries, setTodaysEntries] = useState<TimeEntry[]>([])
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])

  // --- Layout / Bearbeitung ---
  const [layout, setLayout] = useState<DashboardWidgetInstance[] | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [openModalKey, setOpenModalKey] = useState<DashboardModalKey | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const loadDashboardData = useCallback(async () => {
    try {
      const [currentTimeEntries, projects, todays, employees, materials, leaveRequests] =
        await Promise.all([
          DataService.getCurrentTimeEntries(),
          DataService.getAllProjects(),
          DataService.getTodaysTimeEntries(),
          DataService.getAllEmployees(),
          DataService.getAllMaterialTypes(),
          DataService.getAllLeaveRequests()
        ])

      setClockedInCount(new Set(currentTimeEntries.map((e) => e.employeeId)).size)
      setActiveProjectsCount(
        projects.filter((p) => p.status === 'active' || p.isActive === true).length
      )
      setTotalEmployees(employees.length)
      setTodayHours(DataService.calculateTotalWorkHours(todays).toFixed(2))
      setOpenVacationCount(leaveRequests.filter((r) => r.status === 'pending').length)

      setTodaysEntries(todays)
      setAllEmployees(employees)
      setAllProjects(projects)
      setMaterialTypes(materials)

      const activities = currentTimeEntries
        .slice(0, 15)
        .map((entry) => {
          const employee = employees.find((e) => e.id === entry.employeeId)
          const project = projects.find((p) => p.id === entry.projectId)
          if (!employee || !project) return null
          return { employee, project, timeEntry: entry }
        })
        .filter((a): a is LiveActivity => a !== null)
      setLiveActivities(activities)
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error)
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    loadDashboardData()
    const interval = setInterval(loadDashboardData, 30000)
    return () => clearInterval(interval)
  }, [loadDashboardData])

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  // Gespeichertes Layout laden (kontoweit); sonst Standard-Anordnung.
  useEffect(() => {
    let cancelled = false
    DataService.loadAdminDashboard(adminKey)
      .then((saved) => {
        if (cancelled) return
        setLayout(saved && saved.length > 0 ? saved : buildDefaultLayout())
      })
      .catch(() => {
        if (!cancelled) setLayout(buildDefaultLayout())
      })
    return () => {
      cancelled = true
    }
  }, [adminKey])

  // Layout ändern + kontoweit speichern.
  const applyLayout = useCallback(
    (next: DashboardWidgetInstance[]) => {
      setLayout(next)
      DataService.saveAdminDashboard(adminKey, next).catch(() =>
        toast.error('Dashboard konnte nicht gespeichert werden.')
      )
    },
    [adminKey]
  )

  const handleAdminClockOut = useCallback(
    async (timeEntry: TimeEntry, employeeName: string) => {
      if (!confirm(`Möchten Sie ${employeeName} wirklich ausstempeln?`)) return
      setClockingOutId(timeEntry.id)
      try {
        const pauseRaw = window.prompt(
          `Pausenzeit für ${employeeName} in Minuten (0 wenn keine Pause):`,
          '0'
        )
        if (pauseRaw === null) {
          setClockingOutId(null)
          return
        }
        const pauseMinutes = Number.parseInt(String(pauseRaw).trim(), 10)
        if (Number.isNaN(pauseMinutes) || pauseMinutes < 0 || pauseMinutes > 24 * 60) {
          toast.error('Bitte eine gültige Pausenzeit zwischen 0 und 1440 Minuten eingeben.')
          setClockingOutId(null)
          return
        }
        await DataService.updateTimeEntry(timeEntry.id, {
          clockOutTime: new Date(),
          pauseTotalTime: pauseMinutes * 60 * 1000,
          notes: (timeEntry.notes || '') + (timeEntry.notes ? ' | ' : '') + 'Ausgestempelt durch Admin',
          heroSyncStatus: 'pending'
        })
        toast.success(`${employeeName} wurde ausgestempelt`)
        loadDashboardData()
      } catch (error: any) {
        toast.error('Fehler beim Ausstempeln: ' + error.message)
      } finally {
        setClockingOutId(null)
      }
    },
    [loadDashboardData]
  )

  const ctx: DashboardContext = {
    data: {
      clockedInCount,
      activeProjectsCount,
      totalEmployees,
      todayHours,
      openVacationCount,
      liveActivities,
      nowTick,
      clockingOutId,
      onAdminClockOut: handleAdminClockOut
    },
    navigate: onNavigate,
    openModal: setOpenModalKey
  }

  // --- Layout-Operationen ---
  const addWidget = (key: string) => {
    if (!layout) return
    const def = getWidgetDef(key)
    if (!def) return
    applyLayout([...layout, { instanceId: genId(), key, size: def.defaultSize }])
  }
  const removeWidget = (instanceId: string) => {
    if (!layout) return
    applyLayout(layout.filter((w) => w.instanceId !== instanceId))
  }
  const cycleSize = (instanceId: string) => {
    if (!layout) return
    applyLayout(
      layout.map((w) =>
        w.instanceId === instanceId
          ? { ...w, size: SIZE_CYCLE[(SIZE_CYCLE.indexOf(w.size) + 1) % SIZE_CYCLE.length] }
          : w
      )
    )
  }
  const moveWidget = (from: number, to: number) => {
    if (!layout || to < 0 || to >= layout.length || from === to) return
    const next = [...layout]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    applyLayout(next)
  }
  const resetLayout = () => {
    if (confirm('Dashboard auf die Standard-Anordnung zurücksetzen?')) {
      applyLayout(buildDefaultLayout())
    }
  }

  const triggerAction = (key: string) => {
    const def = getWidgetDef(key)
    if (!def?.action) return
    if (def.action.type === 'tab') onNavigate(def.action.tab)
    else setOpenModalKey(def.action.modal)
  }

  const renderCard = (inst: DashboardWidgetInstance, index: number) => {
    const def = getWidgetDef(inst.key)
    if (!def) return null
    const isLauncher = def.kind === 'launcher'
    const clickable = isLauncher && !editMode

    return (
      <div
        key={inst.instanceId}
        className={`dw-card dw-size-${inst.size} ${editMode ? 'dw-editing' : ''} ${
          dragIndex === index ? 'dw-dragging' : ''
        }`}
        draggable={editMode}
        onDragStart={() => editMode && setDragIndex(index)}
        onDragOver={(e) => {
          if (editMode && dragIndex !== null) e.preventDefault()
        }}
        onDrop={() => {
          if (editMode && dragIndex !== null) moveWidget(dragIndex, index)
          setDragIndex(null)
        }}
        onDragEnd={() => setDragIndex(null)}
        onClick={clickable ? () => triggerAction(inst.key) : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  triggerAction(inst.key)
                }
              }
            : undefined
        }
      >
        <div className="dw-card-head">
          <span className="dw-card-title">{def.title}</span>
          {editMode && (
            <div className="dw-card-tools" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="dw-tool" title="Nach vorne" onClick={() => moveWidget(index, index - 1)}>◀</button>
              <button type="button" className="dw-tool" title="Nach hinten" onClick={() => moveWidget(index, index + 1)}>▶</button>
              <button type="button" className="dw-tool" title="Größe ändern" onClick={() => cycleSize(inst.instanceId)}>{SIZE_LABEL[inst.size]}</button>
              <button type="button" className="dw-tool dw-tool-remove" title="Entfernen" onClick={() => removeWidget(inst.instanceId)}>×</button>
            </div>
          )}
        </div>
        <div className="dw-card-body">
          {isLauncher ? (
            <p className="dw-launcher-desc">{def.description}</p>
          ) : (
            def.render?.(ctx)
          )}
        </div>
      </div>
    )
  }

  if (layout === null || isLoadingData) {
    return <div className="loading">Lade Dashboard…</div>
  }

  return (
    <div className="dashboard-tab">
      <div className="dw-toolbar">
        <h3>Dashboard</h3>
        <div className="dw-toolbar-actions">
          {editMode && (
            <>
              <button type="button" className="btn secondary-btn" onClick={() => setShowAddModal(true)}>
                ＋ Widget
              </button>
              <button type="button" className="btn secondary-btn" onClick={resetLayout}>
                Standard
              </button>
            </>
          )}
          <button
            type="button"
            className={`btn ${editMode ? 'primary-btn' : 'secondary-btn'}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? 'Fertig' : 'Bearbeiten'}
          </button>
        </div>
      </div>

      {editMode && (
        <p className="dw-edit-hint">
          Kacheln per ◀ ▶ (oder Ziehen) sortieren, mit S/M/L die Größe ändern, × entfernt sie.
          Änderungen werden automatisch gespeichert.
        </p>
      )}

      {layout.length === 0 ? (
        <div className="dw-empty-board">
          <p>Dein Dashboard ist leer.</p>
          <button type="button" className="btn primary-btn" onClick={() => { setEditMode(true); setShowAddModal(true) }}>
            Widget hinzufügen
          </button>
        </div>
      ) : (
        <div className="dw-grid">{layout.map(renderCard)}</div>
      )}

      {showAddModal && (
        <AddWidgetModal
          usedKeys={layout.map((w) => w.key)}
          onAdd={addWidget}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {openModalKey === 'employee' && (
        <EmployeeModal
          employee={null}
          onClose={() => setOpenModalKey(null)}
          onSave={() => { setOpenModalKey(null); loadDashboardData() }}
        />
      )}
      {openModalKey === 'project' && (
        <ProjectModal
          project={null}
          onClose={() => setOpenModalKey(null)}
          onSave={() => { setOpenModalKey(null); loadDashboardData() }}
        />
      )}
      {openModalKey === 'customer' && (
        <CustomerModal
          customer={null}
          onClose={() => setOpenModalKey(null)}
          onSave={() => { setOpenModalKey(null); loadDashboardData() }}
        />
      )}
      {openModalKey === 'material' && (
        <MaterialTypeModal
          item={null}
          onClose={() => setOpenModalKey(null)}
          onSave={() => { setOpenModalKey(null); loadDashboardData() }}
        />
      )}
      {openModalKey === 'vehicle' && (
        <VehicleModal
          vehicle={null}
          onClose={() => setOpenModalKey(null)}
          onSave={() => { setOpenModalKey(null); loadDashboardData() }}
        />
      )}
      {openModalKey === 'dailyReport' && (
        <DailyReportModal
          entries={todaysEntries}
          employees={allEmployees}
          projects={allProjects}
          materialTypes={materialTypes}
          onClose={() => setOpenModalKey(null)}
        />
      )}
    </div>
  )
}

export default DashboardTab
