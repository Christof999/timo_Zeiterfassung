import { useState, useEffect, useRef } from 'react'
import { DataService } from '../../services/dataService'
import { heroService } from '../../services/heroService'
import type {
  Project,
  FileUpload,
  TimeEntry,
  OfferPosition,
  MaterialCredit,
  MaterialType
} from '../../types'
import { Timestamp } from 'firebase/firestore'
import { toast } from '../ToastContainer'
import { getFileImageSrc } from '../../utils/fileImageSrc'
import { getReturnTravelCreditMs } from '../../utils/returnTravel'
import { roundedSpanMs } from '../../utils/timeRounding'
import { collectEntryDocumentation } from '../../utils/entryDocumentation'
import '../../styles/Modal.css'

interface ProjectDetailModalProps {
  project: Project
  onClose: () => void
}

interface TimeEntryWithEmployee extends TimeEntry {
  employeeName?: string
}

const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({ project, onClose }) => {
  const [activeTab, setActiveTab] = useState<
    'construction-site' | 'documents' | 'timeentries' | 'material'
  >('construction-site')
  const [photos, setPhotos] = useState<FileUpload[]>([])
  const [documents, setDocuments] = useState<FileUpload[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntryWithEmployee[]>([])
  const [materialCredits, setMaterialCredits] = useState<MaterialCredit[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  // Formular zum Erfassen einer Material-Buchung (Gutschrift oder nachgetragener Verbrauch)
  const [movementKind, setMovementKind] = useState<'credit' | 'consumption'>('credit')
  const [creditTypeId, setCreditTypeId] = useState('')
  const [creditName, setCreditName] = useState('')
  const [creditQty, setCreditQty] = useState('')
  const [creditUnit, setCreditUnit] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [isSavingCredit, setIsSavingCredit] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lightboxImage, setLightboxImage] = useState<{
    src: string
    fileName: string
    notes?: string
    imageComment?: string
  } | null>(null)
  const [timeEntryDetail, setTimeEntryDetail] = useState<TimeEntryWithEmployee | null>(null)
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [moveTargetProjectId, setMoveTargetProjectId] = useState('')
  const [moveUiOpen, setMoveUiOpen] = useState(false)
  const [isMovingEntry, setIsMovingEntry] = useState(false)
  const [detailInfoHeight, setDetailInfoHeight] = useState<number | null>(null)
  const [isDetailInfoResizing, setIsDetailInfoResizing] = useState(false)
  const [offerPositions, setOfferPositions] = useState<OfferPosition[]>(project.offerPositions || [])
  const [offerMeta, setOfferMeta] = useState<Project['offerMeta'] | null>(project.offerMeta || null)
  const [isImportingOffer, setIsImportingOffer] = useState(false)
  // Editor für die Materialliste (Soll-Positionen): null = geschlossen, -1 = neue Position, sonst Index.
  const [editingPosIndex, setEditingPosIndex] = useState<number | null>(null)
  const [posDraft, setPosDraft] = useState<{
    name: string
    kind: 'material' | 'labor'
    unit: string
    quantity: string
    unitPriceEur: string
  }>({ name: '', kind: 'material', unit: '', quantity: '', unitPriceEur: '' })
  const [isSavingPositions, setIsSavingPositions] = useState(false)
  // Ausgewähltes Material aus dem Katalog im Positions-Editor ('' = Freitext)
  const [posTypeId, setPosTypeId] = useState('')
  const modalContentRef = useRef<HTMLDivElement | null>(null)
  const detailInfoRef = useRef<HTMLDivElement | null>(null)

  const setDetailHeightFromPointer = (clientY: number) => {
    const detailsRect = detailInfoRef.current?.getBoundingClientRect()
    const modalRect = modalContentRef.current?.getBoundingClientRect()
    if (!detailsRect || !modalRect || modalRect.height <= 0) return

    const minHeight = 120
    const maxHeight = Math.max(minHeight, Math.floor(modalRect.height * 0.62))
    const nextHeight = Math.round(clientY - detailsRect.top)
    const clampedHeight = Math.min(maxHeight, Math.max(minHeight, nextHeight))
    setDetailInfoHeight(clampedHeight)
  }

  const startDetailResize = (clientY: number) => {
    setDetailHeightFromPointer(clientY)
    setIsDetailInfoResizing(true)
  }

  useEffect(() => {
    loadProjectData()
  }, [project])

  useEffect(() => {
    setDetailInfoHeight(null)
    setIsDetailInfoResizing(false)
  }, [project.id])

  useEffect(() => {
    setMoveUiOpen(false)
    setMoveTargetProjectId('')
  }, [timeEntryDetail?.id])

  useEffect(() => {
    if (!isDetailInfoResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault()
      setDetailHeightFromPointer(event.clientY)
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!event.touches.length) return
      event.preventDefault()
      setDetailHeightFromPointer(event.touches[0].clientY)
    }

    const stopResizing = () => {
      setIsDetailInfoResizing(false)
    }

    document.body.style.cursor = 'row-resize'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResizing)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', stopResizing)
    window.addEventListener('touchcancel', stopResizing)

    return () => {
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResizing)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', stopResizing)
      window.removeEventListener('touchcancel', stopResizing)
    }
  }, [isDetailInfoResizing])

  const loadProjectData = async () => {
    setIsLoading(true)
    try {
      console.log('Lade Projektdaten für:', project.id, project.name)
      
      // Verwende getProjectFiles wie in der alten App (lädt aus Zeiteinträgen)
      const [allPhotos, allDocs, timeEntries, employees, projectsList, credits, matTypes] = await Promise.all([
        DataService.getProjectFiles(project.id!, 'construction_site').catch(err => {
          console.error('Fehler beim Laden der Fotos:', err)
          return []
        }),
        DataService.getProjectFiles(project.id!, 'document').catch(err => {
          console.error('Fehler beim Laden der Dokumente:', err)
          return []
        }),
        DataService.getTimeEntriesByProject(project.id!).catch(err => {
          console.error('Fehler beim Laden der Zeiteinträge:', err)
          return []
        }),
        DataService.getAllEmployees().catch(err => {
          console.error('Fehler beim Laden der Mitarbeiter:', err)
          return []
        }),
        DataService.getAllProjects().catch((err) => {
          console.error('Fehler beim Laden der Projekte:', err)
          return [] as Project[]
        }),
        DataService.getMaterialCreditsByProject(project.id!).catch((err) => {
          console.error('Fehler beim Laden der Material-Gutschriften:', err)
          return [] as MaterialCredit[]
        }),
        DataService.getActiveMaterialTypes().catch((err) => {
          console.error('Fehler beim Laden der Materialarten:', err)
          return [] as MaterialType[]
        })
      ])

      setAllProjects(projectsList)
      setMaterialCredits(credits)
      setMaterialTypes(matTypes)
      
      console.log('Geladene Fotos:', allPhotos.length, allPhotos)
      console.log('Geladene Dokumente:', allDocs.length, allDocs)
      console.log('Geladene Zeiteinträge:', timeEntries.length)
      console.log('Geladene Mitarbeiter:', employees.length)
      
      // Debug: Zeige die ersten 2 Fotos komplett mit ALLEN Feldern
      if (allPhotos.length > 0) {
        console.log('ERSTES FOTO KOMPLETT:', JSON.stringify(allPhotos[0], null, 2))
        console.log('ALLE FELDER DES ERSTEN FOTOS:', Object.keys(allPhotos[0]))
        if (allPhotos.length > 1) {
          console.log('ZWEITES FOTO KOMPLETT:', JSON.stringify(allPhotos[1], null, 2))
        }
      }
      
      const sortedPhotos = [...allPhotos].sort((a, b) => getTimeValue(b.uploadTime) - getTimeValue(a.uploadTime))
      const sortedDocuments = [...allDocs].sort((a, b) => getTimeValue(b.uploadTime) - getTimeValue(a.uploadTime))
      const sortedTimeEntries = [...timeEntries].sort((a, b) => getTimeValue(b.clockInTime) - getTimeValue(a.clockInTime))

      // Anzeige-URLs ergänzen (Firebase-Storage-Pfade auflösen / Legacy-Base64 nachladen)
      const [photosWithUrls, documentsWithUrls] = await Promise.all([
        DataService.enrichFilesForDisplay(sortedPhotos),
        DataService.enrichFilesForDisplay(sortedDocuments)
      ])

      // Mitarbeiternamen zu Zeiteinträgen hinzufügen
      const entriesWithNames: TimeEntryWithEmployee[] = sortedTimeEntries.map(entry => {
        const employee = employees.find(emp => emp.id === entry.employeeId)
        return {
          ...entry,
          employeeName: employee 
            ? (employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim())
            : entry.employeeId
        }
      })

      setPhotos(photosWithUrls)
      setDocuments(documentsWithUrls)
      setTimeEntries(entriesWithNames)
    } catch (error) {
      console.error('Fehler beim Laden der Projektdaten:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Hilfsfunktion zum Konvertieren von Timestamps zu Date
  const convertToDate = (timestamp: any): Date | null => {
    if (!timestamp) return null
    
    if (timestamp instanceof Date) {
      return timestamp
    }
    
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate()
    }
    
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate()
    }
    
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp)
    }
    
    // Firebase Timestamp Format { seconds, nanoseconds }
    if (timestamp.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000)
    }
    
    return null
  }

  const getTimeValue = (value: any): number => {
    const date = convertToDate(value)
    return date ? date.getTime() : 0
  }

  const fileCaption = (file: FileUpload): string =>
    file.imageComment?.trim() || file.notes?.trim() || ''

  const formatUploadDay = (value: any): string => {
    const date = convertToDate(value)
    if (!date) return 'Uploaddatum unbekannt'

    return date.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  // Hilfsfunktion zur Berechnung der Arbeitsstunden
  const calculateHours = (entry: TimeEntry): string => {
    if (!entry.clockOutTime || !entry.clockInTime) {
      return '-'
    }

    const clockIn = convertToDate(entry.clockInTime)
    const clockOut = convertToDate(entry.clockOutTime)

    if (!clockIn || !clockOut) {
      return '-'
    }

    // Zeiten auf 15-Min-Raster glätten (einheitliche Basis)
    const diffMs = roundedSpanMs(clockIn, clockOut)
    const pauseTotalTime = entry.pauseTotalTime || 0
    const actualWorkTime = diffMs - pauseTotalTime + getReturnTravelCreditMs(entry)
    const hours = actualWorkTime / (1000 * 60 * 60)

    if (isNaN(hours)) {
      return '-'
    }

    // Negative Arbeitszeit (Pause länger als gestempelte Zeit) als 0,00h zeigen,
    // statt verwirrend "-" – z. B. bei sehr kurzen Test-Stempelungen.
    if (hours < 0) {
      return '0.00h'
    }

    return hours.toFixed(2) + 'h'
  }

  // Verbrauch (aus Zeiteinträgen) + Gutschriften zu einer einheitlichen Liste zusammenführen
  type MaterialMovement = {
    id: string
    kind: 'consumption' | 'credit'
    date: Date | null
    who: string
    name: string
    quantity: number
    unit: string
    /** Nur Gutschriften aus der materialCredits-Collection lassen sich hier löschen */
    deletable?: boolean
  }

  const materialMovements: MaterialMovement[] = (() => {
    const rows: MaterialMovement[] = []
    for (const entry of timeEntries) {
      const when = convertToDate(entry.clockOutTime) || convertToDate(entry.clockInTime)
      const who = entry.employeeName || entry.employeeId || '—'
      for (const [i, usage] of (entry.materialUsages || []).entries()) {
        rows.push({
          id: `${entry.id}-mu-${i}`,
          kind: 'consumption',
          date: when,
          who,
          name: usage.materialName || '—',
          quantity: usage.quantity || 0,
          unit: usage.unitLabel || ''
        })
      }
      // Vom Mitarbeiter beim Ausstempeln gutgeschriebenes Material
      for (const [i, usage] of (entry.materialCreditUsages || []).entries()) {
        rows.push({
          id: `${entry.id}-mc-${i}`,
          kind: 'credit',
          date: when,
          who,
          name: usage.materialName || '—',
          quantity: usage.quantity || 0,
          unit: usage.unitLabel || ''
        })
      }
    }
    for (const credit of materialCredits) {
      rows.push({
        id: credit.id,
        kind: credit.kind === 'consumption' ? 'consumption' : 'credit',
        date: convertToDate(credit.createdAt),
        who: credit.employeeName || '—',
        name: credit.materialName || '—',
        quantity: credit.quantity || 0,
        unit: credit.unitLabel || '',
        deletable: true
      })
    }
    return rows.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
  })()

  const handleCreditTypeChange = (id: string) => {
    setCreditTypeId(id)
    const type = materialTypes.find((t) => t.id === id)
    if (type) {
      setCreditName(type.name || '')
      setCreditUnit(type.unitLabel || '')
    } else if (id === '') {
      setCreditName('')
      setCreditUnit('')
    }
  }

  const handleAddCredit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = creditName.trim()
    const qty = Number.parseFloat(creditQty.replace(',', '.'))
    if (!name) {
      toast.error('Bitte ein Material auswählen oder eingeben.')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Bitte eine gültige Menge größer 0 eingeben.')
      return
    }
    setIsSavingCredit(true)
    try {
      const admin = await DataService.getCurrentAdmin().catch(() => null)
      const selectedType = materialTypes.find((t) => t.id === creditTypeId)
      await DataService.addMaterialCredit({
        projectId: project.id!,
        kind: movementKind,
        employeeId: admin?.id,
        employeeName: admin?.name || 'Admin',
        materialTypeId: selectedType?.id,
        materialName: name,
        unitLabel: creditUnit.trim() || selectedType?.unitLabel,
        unitPriceEur: typeof selectedType?.unitPriceEur === 'number' ? selectedType.unitPriceEur : undefined,
        quantity: qty,
        note: creditNote.trim() || undefined
      })
      toast.success(movementKind === 'consumption' ? 'Verbrauch nachgetragen.' : 'Gutschrift erfasst.')
      setCreditTypeId('')
      setCreditName('')
      setCreditQty('')
      setCreditUnit('')
      setCreditNote('')
      await loadProjectData()
      setActiveTab('material')
    } catch (err: any) {
      toast.error('Fehler beim Speichern: ' + (err?.message || err))
    } finally {
      setIsSavingCredit(false)
    }
  }

  const handleDeleteCredit = async (id: string) => {
    if (!window.confirm('Diese Gutschrift wirklich löschen?')) return
    try {
      await DataService.deleteMaterialCredit(id)
      toast.success('Gutschrift gelöscht.')
      await loadProjectData()
      setActiveTab('material')
    } catch (err: any) {
      toast.error('Fehler beim Löschen: ' + (err?.message || err))
    }
  }

  const getClockOutLocation = (entry: TimeEntry) =>
    entry.clockOutLocation ?? entry.locationOut ?? null

  const formatLocationText = (loc: { lat: number | null; lng: number | null } | null | undefined) => {
    if (!loc || loc.lat == null || loc.lng == null) return null
    return `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`
  }

  const openStreetMapUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`

  const moveTargetOptions = [...allProjects]
    .filter((p) => p.id && p.id !== project.id)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))

  const handleConfirmMoveTimeEntry = async () => {
    if (!timeEntryDetail?.id || !moveTargetProjectId) {
      toast.error('Bitte wählen Sie ein Zielprojekt.')
      return
    }
    const target = allProjects.find((p) => p.id === moveTargetProjectId)
    setIsMovingEntry(true)
    try {
      await DataService.moveTimeEntryToProject(timeEntryDetail.id, moveTargetProjectId, {
        sourceProjectName: project.name,
        targetProjectName: target?.name
      })
      toast.success('Stempelsatz und Dokumentation wurden umgezogen.')
      setTimeEntryDetail(null)
      setMoveUiOpen(false)
      setMoveTargetProjectId('')
      await loadProjectData()
    } catch (e: any) {
      toast.error(e?.message || 'Umzug fehlgeschlagen')
    } finally {
      setIsMovingEntry(false)
    }
  }

  const handleImportOffer = async () => {
    if (!project.heroProjectId) return
    setIsImportingOffer(true)
    try {
      const res = await heroService.syncProjectOffer(project.heroProjectId)
      if (res.offerResult && res.offerResult.found === false) {
        toast.error(res.offerResult.message || 'Kein Angebot für dieses Projekt gefunden.')
        return
      }
      const refreshed = await DataService.getProjectById(project.id!)
      setOfferPositions(refreshed?.offerPositions || [])
      setOfferMeta(refreshed?.offerMeta || null)
      toast.success(
        `Angebot übernommen: ${res.offerResult?.materialCount ?? 0} Material-, ${res.offerResult?.laborCount ?? 0} Lohnposition(en).`
      )
    } catch (e: any) {
      toast.error('Angebots-Import fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'))
    } finally {
      setIsImportingOffer(false)
    }
  }

  // --- Materialliste (Soll-Positionen) bearbeiten -------------------------
  const resetPosDraft = () => {
    setPosDraft({ name: '', kind: 'material', unit: '', quantity: '', unitPriceEur: '' })
    setPosTypeId('')
  }

  const startAddPosition = () => {
    resetPosDraft()
    setEditingPosIndex(-1)
  }

  const startEditPosition = (index: number) => {
    const p = offerPositions[index]
    setPosDraft({
      name: p.name || '',
      kind: p.kind === 'labor' ? 'labor' : 'material',
      unit: p.unit || '',
      quantity: p.quantity != null ? String(p.quantity) : '',
      unitPriceEur: p.unitPriceEur != null ? String(p.unitPriceEur) : ''
    })
    // Bestehende Position: passenden Katalog-Eintrag vorauswählen (per Name), sonst Freitext.
    const match = materialTypes.find(
      (t) => (t.name || '').trim().toLowerCase() === (p.name || '').trim().toLowerCase()
    )
    setPosTypeId(match?.id || '')
    setEditingPosIndex(index)
  }

  const cancelEditPosition = () => {
    setEditingPosIndex(null)
    resetPosDraft()
  }

  // Auswahl aus dem Material-Katalog: Bezeichnung, Einheit und Preis vorbefüllen.
  const handlePosTypeChange = (id: string) => {
    setPosTypeId(id)
    const type = materialTypes.find((t) => t.id === id)
    if (!type) return
    setPosDraft((d) => ({
      ...d,
      kind: 'material',
      name: type.name || '',
      unit: type.unitLabel || d.unit,
      unitPriceEur: type.unitPriceEur != null ? String(type.unitPriceEur) : d.unitPriceEur
    }))
  }

  const buildMetaForPositions = (positions: OfferPosition[]): Project['offerMeta'] => {
    const materialCount = positions.filter((p) => p.kind === 'material').length
    return { ...(offerMeta || {}), positionCount: positions.length, materialCount }
  }

  const persistPositions = async (positions: OfferPosition[]) => {
    if (!project.id) return
    setIsSavingPositions(true)
    try {
      const meta = buildMetaForPositions(positions)
      await DataService.updateProject(project.id, { offerPositions: positions, offerMeta: meta })
      setOfferPositions(positions)
      setOfferMeta(meta || null)
    } finally {
      setIsSavingPositions(false)
    }
  }

  const handleSavePosition = async () => {
    const name = posDraft.name.trim()
    if (!name) {
      toast.error('Bitte eine Bezeichnung für die Position angeben.')
      return
    }
    const parseNum = (v: string): number | undefined => {
      const trimmed = v.trim()
      if (!trimmed) return undefined
      const n = Number.parseFloat(trimmed.replace(',', '.'))
      return Number.isFinite(n) ? n : undefined
    }
    const quantity = parseNum(posDraft.quantity)
    const unitPriceEur = parseNum(posDraft.unitPriceEur)
    const unit = posDraft.unit.trim()

    // Firestore verträgt keine undefined-Felder in Array-Objekten → leere weglassen.
    // Manuell gepflegte Positionen als 'manual' markieren, damit sie den HERO-Sync überleben.
    const next: OfferPosition = { name, kind: posDraft.kind, source: 'manual' }
    if (unit) next.unit = unit
    if (quantity !== undefined) next.quantity = quantity
    if (unitPriceEur !== undefined) next.unitPriceEur = unitPriceEur

    const isNew = editingPosIndex === -1 || editingPosIndex === null
    const positions = [...offerPositions]
    if (isNew) {
      positions.push(next)
    } else {
      positions[editingPosIndex] = next
    }

    try {
      await persistPositions(positions)
      toast.success(isNew ? 'Position hinzugefügt.' : 'Position aktualisiert.')
      cancelEditPosition()
    } catch (e: any) {
      toast.error('Materialliste konnte nicht gespeichert werden: ' + (e?.message || 'Fehler'))
    }
  }

  const handleDeletePosition = async (index: number) => {
    const p = offerPositions[index]
    if (!confirm(`Position „${p.name}“ wirklich aus der Materialliste entfernen?`)) return
    const positions = offerPositions.filter((_, i) => i !== index)
    try {
      await persistPositions(positions)
      toast.success('Position entfernt.')
      if (editingPosIndex === index) cancelEditPosition()
    } catch (e: any) {
      toast.error('Position konnte nicht entfernt werden: ' + (e?.message || 'Fehler'))
    }
  }

  const renderTimeEntryLocationModal = () => {
    if (!timeEntryDetail) return null

    const clockInDate = convertToDate(timeEntryDetail.clockInTime)
    const clockOutDate = convertToDate(timeEntryDetail.clockOutTime)
    const canMoveEntry = !!clockOutDate
    const inLoc = formatLocationText(timeEntryDetail.clockInLocation)
    const outLocRaw = getClockOutLocation(timeEntryDetail)
    const outLoc = formatLocationText(outLocRaw)

    return (
      <div
        className="time-entry-location-overlay"
        onClick={(e) => {
          e.stopPropagation()
          setTimeEntryDetail(null)
        }}
      >
        <div
          className="time-entry-location-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="time-entry-location-close"
            onClick={() => setTimeEntryDetail(null)}
            aria-label="Schließen"
          >
            ×
          </button>
          <div className="time-entry-location-head">
            <h3 className="time-entry-location-name">
              {timeEntryDetail.employeeName || timeEntryDetail.employeeId}
            </h3>
            <p className="time-entry-location-date">
              {clockInDate
                ? clockInDate.toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })
                : '—'}
            </p>
          </div>

          <div className="time-entry-location-block">
            <span className="time-entry-location-label">Eingestempelt</span>
            <p className="time-entry-location-time">
              {clockInDate
                ? clockInDate.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : '—'}
            </p>
            <span className="time-entry-location-sublabel">Ort</span>
            {inLoc ? (
              <>
                <p className="time-entry-location-coords">{inLoc}</p>
                {timeEntryDetail.clockInLocation?.lat != null &&
                  timeEntryDetail.clockInLocation?.lng != null && (
                    <a
                      href={openStreetMapUrl(
                        timeEntryDetail.clockInLocation.lat,
                        timeEntryDetail.clockInLocation.lng
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="time-entry-location-maplink"
                    >
                      Auf Karte anzeigen
                    </a>
                  )}
              </>
            ) : (
              <p className="time-entry-location-missing">Kein Standort erfasst</p>
            )}
          </div>

          <div className="time-entry-location-block">
            <span className="time-entry-location-label">Ausgestempelt</span>
            <p className="time-entry-location-time">
              {clockOutDate
                ? clockOutDate.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Noch eingestempelt'}
            </p>
            <span className="time-entry-location-sublabel">Ort</span>
            {clockOutDate ? (
              outLoc ? (
                <>
                  <p className="time-entry-location-coords">{outLoc}</p>
                  {outLocRaw?.lat != null && outLocRaw?.lng != null && (
                    <a
                      href={openStreetMapUrl(outLocRaw.lat, outLocRaw.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="time-entry-location-maplink"
                    >
                      Auf Karte anzeigen
                    </a>
                  )}
                </>
              ) : (
                <p className="time-entry-location-missing">Kein Standort erfasst</p>
              )
            ) : (
              <p className="time-entry-location-missing">—</p>
            )}
          </div>

          {(() => {
            const reportText = collectEntryDocumentation(timeEntryDetail).trim()
            return (
              <div className="time-entry-location-block time-entry-report-block">
                <span className="time-entry-location-label">Bericht / Dokumentation</span>
                {reportText ? (
                  <p className="time-entry-report-text">{reportText}</p>
                ) : (
                  <p className="time-entry-location-missing">Kein schriftlicher Bericht erfasst</p>
                )}
              </div>
            )
          })()}

          <div className="time-entry-move-section">
            {!canMoveEntry ? (
              <p className="time-entry-move-disabled-hint">
                Ein Umzug ist nur bei abgeschlossenen Zeiteinträgen möglich (bereits ausgestempelt).
              </p>
            ) : moveTargetOptions.length === 0 ? (
              <p className="time-entry-move-disabled-hint">
                Es gibt kein weiteres Projekt, in das umgezogen werden könnte.
              </p>
            ) : !moveUiOpen ? (
              <button
                type="button"
                className="btn secondary-btn time-entry-move-toggle"
                onClick={() => setMoveUiOpen(true)}
              >
                Stempelsatz umziehen
              </button>
            ) : (
              <div className="time-entry-move-panel">
                <label htmlFor="time-entry-move-project" className="time-entry-move-label">
                  Zielprojekt
                </label>
                <select
                  id="time-entry-move-project"
                  className="time-entry-move-select"
                  value={moveTargetProjectId}
                  onChange={(e) => setMoveTargetProjectId(e.target.value)}
                  disabled={isMovingEntry}
                >
                  <option value="">— Projekt wählen —</option>
                  {moveTargetOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                </select>
                <p className="time-entry-move-hint">
                  Zeiten, Baustellenfotos und Belege vom selben Tag werden dem
                  gewählten Projekt zugeordnet.
                </p>
                <div className="time-entry-move-actions">
                  <button
                    type="button"
                    className="btn primary-btn"
                    disabled={isMovingEntry || !moveTargetProjectId}
                    onClick={() => {
                      if (
                        !confirm(
                          'Diesen Stempelsatz wirklich in das gewählte Projekt verschieben? Die Zuordnung kann nicht automatisch rückgängig gemacht werden.'
                        )
                      ) {
                        return
                      }
                      handleConfirmMoveTimeEntry()
                    }}
                  >
                    {isMovingEntry ? 'Wird umgezogen…' : 'Umziehen bestätigen'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary-btn"
                    disabled={isMovingEntry}
                    onClick={() => {
                      setMoveUiOpen(false)
                      setMoveTargetProjectId('')
                    }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalContentRef} className="modal-content project-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{project.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div
          ref={detailInfoRef}
          className="project-detail-info"
          style={detailInfoHeight !== null ? { height: `${detailInfoHeight}px`, maxHeight: 'none' } : undefined}
        >
          <p><strong>Kunde:</strong> {project.client || '-'}</p>
          <p><strong>Status:</strong> {project.status || 'Aktiv'}</p>
          {(project.address || project.location) && (
            <p><strong>Adresse:</strong> {project.address || project.location}</p>
          )}
          {project.description && (
            <div className="project-description">
              <strong>Beschreibung:</strong>
              <div className="description-text">
                {project.description.split('\n').map((line, index) => (
                  <p key={index}>{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
          )}

          <div className="project-offer-section">
            <div className="project-offer-head">
              <strong>Materialliste (Soll):</strong>
              {project.heroProjectId && (
                <button
                  type="button"
                  className="btn secondary-btn btn-sm"
                  onClick={handleImportOffer}
                  disabled={isImportingOffer}
                >
                  {isImportingOffer
                    ? 'Lade\u2026'
                    : offerMeta
                      ? 'Angebot aktualisieren'
                      : 'Angebot von HERO laden'}
                </button>
              )}
            </div>

            {offerMeta && (offerMeta.nr || offerMeta.date) && (
              <p className="project-offer-meta">
                {offerMeta.nr ? `${offerMeta.nr} \u00B7 ` : ''}
                {offerMeta.date || ''}
                {' \u00B7 '}
                {offerMeta.materialCount ?? 0} Material / {(offerMeta.positionCount ?? 0) - (offerMeta.materialCount ?? 0)} Lohn
              </p>
            )}

            {offerPositions.length > 0 ? (
              <div className="project-material-list">
                {offerPositions.map((p, i) => (
                  <div className="project-material-item" key={`${p.nr || p.name}-${i}`}>
                    <div className="project-material-main">
                      <div className="project-material-name">
                        <span className="project-material-title">{p.name}</span>
                        {p.source === 'manual' && (
                          <span className="project-offer-manual-badge" title={'Manuell im Projekt erg\u00E4nzt'}>
                            manuell
                          </span>
                        )}
                      </div>
                      <div className="project-material-meta">
                        <span className={`status-badge ${p.kind === 'material' ? 'active' : 'inactive'}`}>
                          {p.kind === 'material' ? 'Material' : 'Lohn'}
                        </span>
                        <span className="project-material-qty">
                          {(p.quantity ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                          {p.unit ? ` ${p.unit}` : ''}
                        </span>
                        <span className="project-material-price">
                          {typeof p.unitPriceEur === 'number' ? `${p.unitPriceEur.toFixed(2)} \u20AC` : '\u2014'}
                        </span>
                      </div>
                    </div>
                    <div className="project-material-actions">
                      <button
                        type="button"
                        className="btn secondary-btn btn-sm"
                        onClick={() => startEditPosition(i)}
                        disabled={isSavingPositions}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="btn danger-btn btn-sm"
                        onClick={() => handleDeletePosition(i)}
                        disabled={isSavingPositions}
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="project-offer-empty">
                {project.heroProjectId
                  ? 'Noch kein Material hinterlegt. \u201EAngebot von HERO laden\u201C oder eine Position manuell hinzuf\u00FCgen.'
                  : 'Noch kein Material hinterlegt. Position manuell hinzuf\u00FCgen.'}
              </p>
            )}

            {editingPosIndex !== null ? (
              <div className="project-offer-editor">
                <div className="project-offer-editor-grid">
                  <label className="project-offer-field project-offer-field-name">
                    <span>Aus Material-Katalog</span>
                    <select value={posTypeId} onChange={(e) => handlePosTypeChange(e.target.value)}>
                      <option value="">Freitext / manuell eingeben \u2026</option>
                      {materialTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.unitLabel ? ` (${t.unitLabel})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="project-offer-field project-offer-field-name">
                    <span>Bezeichnung</span>
                    <input
                      type="text"
                      value={posDraft.name}
                      onChange={(e) => {
                        setPosDraft({ ...posDraft, name: e.target.value })
                        if (posTypeId) setPosTypeId('')
                      }}
                      placeholder={'z. B. Fliesen 60\u00D760'}
                      autoFocus
                    />
                  </label>
                  <label className="project-offer-field">
                    <span>Art</span>
                    <select
                      value={posDraft.kind}
                      onChange={(e) => setPosDraft({ ...posDraft, kind: e.target.value as 'material' | 'labor' })}
                    >
                      <option value="material">Material</option>
                      <option value="labor">Lohn</option>
                    </select>
                  </label>
                  <label className="project-offer-field">
                    <span>Einheit</span>
                    <input
                      type="text"
                      value={posDraft.unit}
                      onChange={(e) => setPosDraft({ ...posDraft, unit: e.target.value })}
                      placeholder={'z. B. m\u00B2, St\u00FCck'}
                    />
                  </label>
                  <label className="project-offer-field">
                    <span>Soll-Menge</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={posDraft.quantity}
                      onChange={(e) => setPosDraft({ ...posDraft, quantity: e.target.value })}
                      placeholder="0"
                    />
                  </label>
                  <label className="project-offer-field">
                    <span>{'\u20AC/Einheit'}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={posDraft.unitPriceEur}
                      onChange={(e) => setPosDraft({ ...posDraft, unitPriceEur: e.target.value })}
                      placeholder="optional"
                    />
                  </label>
                </div>
                <div className="project-offer-editor-actions">
                  <button
                    type="button"
                    className="btn primary-btn btn-sm"
                    onClick={handleSavePosition}
                    disabled={isSavingPositions}
                  >
                    {isSavingPositions ? 'Speichern\u2026' : editingPosIndex === -1 ? 'Hinzuf\u00FCgen' : '\u00DCbernehmen'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary-btn btn-sm"
                    onClick={cancelEditPosition}
                    disabled={isSavingPositions}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn secondary-btn btn-sm project-offer-add-btn"
                onClick={startAddPosition}
                disabled={isSavingPositions}
              >
                {'+ Position hinzuf\u00FCgen'}
              </button>
            )}
          </div>
        </div>

        <div
          className={`project-detail-resizer ${isDetailInfoResizing ? 'is-resizing' : ''}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Höhe des oberen Bereichs anpassen"
          title="Ziehen, um den unteren Medienbereich zu vergrößern"
          onDoubleClick={() => setDetailInfoHeight(null)}
          onMouseDown={(event) => {
            event.preventDefault()
            startDetailResize(event.clientY)
          }}
          onTouchStart={(event) => {
            if (!event.touches.length) return
            event.preventDefault()
            startDetailResize(event.touches[0].clientY)
          }}
        />

        <div className="project-tabs">
          <button 
            className={`project-tab-btn ${activeTab === 'construction-site' ? 'active' : ''}`}
            onClick={() => setActiveTab('construction-site')}
          >
            Baustellenfotos
          </button>
          <button 
            className={`project-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Dokumente
          </button>
          <button
            className={`project-tab-btn ${activeTab === 'timeentries' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeentries')}
          >
            Zeiteinträge
          </button>
          <button
            className={`project-tab-btn ${activeTab === 'material' ? 'active' : ''}`}
            onClick={() => setActiveTab('material')}
          >
            Material
          </button>
        </div>

        <div className="project-tab-content">
          {isLoading ? (
            <div className="loading">Lade Daten...</div>
          ) : activeTab === 'construction-site' ? (
            <div className="photo-gallery">
            {photos.length === 0 ? (
                <p className="no-data">Keine Fotos vorhanden</p>
              ) : (
                photos.map((photo) => {
                const imgSrc = getFileImageSrc(photo)
                const uploadDay = formatUploadDay(photo.uploadTime)
                const key = photo.id || `${photo.fileName || imgSrc}-${photo.employeeId || ''}`

                const caption = fileCaption(photo)

                return (
                  <div key={key} className="photo-item">
                    {imgSrc ? (
                      <img 
                        src={imgSrc} 
                        alt={photo.fileName}
                        onClick={() =>
                          setLightboxImage({
                            src: imgSrc,
                            fileName: photo.fileName,
                            notes: photo.notes,
                            imageComment: photo.imageComment
                          })
                        }
                        style={{ cursor: 'pointer' }}
                        onError={(e) => {
                          console.error('Fehler beim Laden des Bildes:', photo.fileName, photo)
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="photo-placeholder">
                        <span>Bild</span>
                        <p>Keine Bilddaten vorhanden</p>
                        <p className="photo-filename">{photo.fileName}</p>
                      </div>
                    )}
                    <p className="photo-filename">{photo.fileName}</p>
                    <p className="photo-upload-date">Upload: {uploadDay}</p>
                    {caption ? <p className="photo-comment">{caption}</p> : null}
                  </div>
                )
                })
              )}
            </div>
          ) : activeTab === 'documents' ? (
            <div className="photo-gallery documents-gallery">
              {documents.length === 0 ? (
                <p className="no-data">Keine Dokumente vorhanden</p>
              ) : (
                documents.map((doc, index) => {
                  const imgSrc = getFileImageSrc(doc)
                  const uploadDay = formatUploadDay(doc.uploadTime)
                  const key = doc.id || `doc-${doc.fileName || imgSrc}-${index}`
                  const mimeType = (doc.mimeType || '').toLowerCase()

                  // Prüfe ob es ein Bild ist
                  const isImage =
                    mimeType.startsWith('image/') ||
                    !!doc.fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
                    imgSrc.startsWith('data:image/') ||
                    (imgSrc.startsWith('http') && mimeType.startsWith('image/'))

                  const docCaption = fileCaption(doc)

                  return (
                    <div key={key} className="photo-item document-item-card">
                      {imgSrc && isImage ? (
                        <img 
                          src={imgSrc} 
                          alt={doc.fileName}
                          onClick={() =>
                            setLightboxImage({
                              src: imgSrc,
                              fileName: doc.fileName,
                              notes: doc.notes,
                              imageComment: doc.imageComment
                            })
                          }
                          style={{ cursor: 'pointer' }}
                          onError={(e) => {
                            console.error('Fehler beim Laden des Dokuments:', doc.fileName)
                            e.currentTarget.style.display = 'none'
                            const parent = e.currentTarget.parentElement
                            if (parent) {
                              const placeholder = document.createElement('div')
                              placeholder.className = 'photo-placeholder'
                              placeholder.innerHTML = '<span>Dok.</span>'
                              parent.insertBefore(placeholder, e.currentTarget)
                            }
                          }}
                        />
                      ) : (
                        <div className="photo-placeholder document-placeholder">
                          <span>Dok.</span>
                        </div>
                      )}
                      <p className="photo-filename">{doc.fileName}</p>
                      <p className="photo-upload-date">Upload: {uploadDay}</p>
                      {docCaption ? <p className="document-notes">{docCaption}</p> : null}
                      {imgSrc && (
                        <a 
                          href={imgSrc}
                          download={doc.fileName}
                          className="document-download-btn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Download
                        </a>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          ) : activeTab === 'timeentries' ? (
            <div className="time-entries-cards">
              {timeEntries.length === 0 ? (
                <p className="no-data">Keine Zeiteinträge vorhanden</p>
              ) : (
                timeEntries.map((entry) => {
                  const clockInDate = convertToDate(entry.clockInTime)
                  const clockOutDate = convertToDate(entry.clockOutTime)
                  const reportText = collectEntryDocumentation(entry).replace(/\s+/g, ' ').trim()

                  return (
                    <div
                      key={entry.id}
                      className="time-entry-card time-entry-card--clickable"
                      role="button"
                      tabIndex={0}
                      title="Klicken für Zeiten und Standorte"
                      onClick={() => setTimeEntryDetail(entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setTimeEntryDetail(entry)
                        }
                      }}
                    >
                      <div className="time-entry-header">
                        <span className="time-entry-employee">{entry.employeeName || entry.employeeId}</span>
                        <span className="time-entry-hours">{calculateHours(entry)}</span>
                      </div>
                      <div className="time-entry-details">
                        <span className="time-entry-date">
                          {clockInDate 
                            ? clockInDate.toLocaleDateString('de-DE', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: '2-digit' 
                              })
                            : '-'}
                        </span>
                        <span className="time-entry-times">
                          {clockInDate 
                            ? clockInDate.toLocaleTimeString('de-DE', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            : '-'}
                          {' - '}
                          {clockOutDate 
                            ? clockOutDate.toLocaleTimeString('de-DE', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            : 'Eingestempelt'}
                        </span>
                      </div>
                      {reportText ? (
                        <p className="time-entry-report-preview">📝 {reportText}</p>
                      ) : (
                        <p className="time-entry-report-preview is-empty">Kein schriftlicher Bericht</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          ) : activeTab === 'material' ? (
            <div className="material-overview">
              <form className="material-credit-form" onSubmit={handleAddCredit}>
                <div className="material-movement-toggle" role="tablist" aria-label="Buchungsart">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={movementKind === 'consumption'}
                    className={`material-movement-toggle-btn kind-consumption ${movementKind === 'consumption' ? 'active' : ''}`}
                    onClick={() => setMovementKind('consumption')}
                  >
                    <span className="material-kind-dot" aria-hidden="true" />
                    Verbrauch nachtragen
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={movementKind === 'credit'}
                    className={`material-movement-toggle-btn kind-credit ${movementKind === 'credit' ? 'active' : ''}`}
                    onClick={() => setMovementKind('credit')}
                  >
                    <span className="material-kind-dot" aria-hidden="true" />
                    Gutschrift
                  </button>
                </div>

                <div className="material-credit-header">
                  <h4>{movementKind === 'consumption' ? 'Verbrauchtes Material nachtragen' : 'Gutschrift erfassen'}</h4>
                  <p className="material-credit-hint">
                    {movementKind === 'consumption'
                      ? 'Auf der Baustelle verbrauchtes Material nachträglich verbuchen (z. B. wenn ein Mitarbeiter es beim Ausstempeln vergessen hat).'
                      : 'Am Projektende zu viel geliefertes Material wieder gutschreiben.'}
                  </p>
                </div>

                <div className="material-credit-grid">
                  <label className="material-field material-field-type">
                    <span className="material-field-label">Material</span>
                    <select
                      value={creditTypeId}
                      onChange={(e) => handleCreditTypeChange(e.target.value)}
                    >
                      <option value="">Freitext / aus Liste wählen …</option>
                      {materialTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.unitLabel ? ` (${t.unitLabel})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="material-field material-field-name">
                    <span className="material-field-label">Materialname</span>
                    <input
                      type="text"
                      value={creditName}
                      onChange={(e) => setCreditName(e.target.value)}
                      placeholder="z. B. Flexkleber M21"
                      required
                    />
                  </label>
                  <label className="material-field material-field-qty">
                    <span className="material-field-label">Menge</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={creditQty}
                      onChange={(e) => setCreditQty(e.target.value)}
                      placeholder="0"
                      required
                    />
                  </label>
                  <label className="material-field material-field-unit">
                    <span className="material-field-label">Einheit</span>
                    <input
                      type="text"
                      value={creditUnit}
                      onChange={(e) => setCreditUnit(e.target.value)}
                      placeholder="Sack, m², Stück …"
                    />
                  </label>
                  <label className="material-field material-field-note">
                    <span className="material-field-label">Notiz <em>(optional)</em></span>
                    <input
                      type="text"
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      placeholder="z. B. Rest an Lager zurück"
                    />
                  </label>
                </div>

                <div className="material-credit-actions">
                  <button
                    type="submit"
                    className={`btn primary-btn ${movementKind === 'credit' ? 'material-submit-credit' : ''}`}
                    disabled={isSavingCredit}
                  >
                    {isSavingCredit
                      ? 'Speichere…'
                      : movementKind === 'consumption'
                        ? '+ Verbrauch verbuchen'
                        : '+ Gutschrift verbuchen'}
                  </button>
                </div>
              </form>

              {materialMovements.length === 0 ? (
                <p className="no-data">Noch kein Material erfasst</p>
              ) : (
                <table className="material-movements-table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Art</th>
                      <th>Material</th>
                      <th className="num">Menge</th>
                      <th>Von</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialMovements.map((m) => (
                      <tr key={m.id} className={m.kind === 'credit' ? 'movement-credit' : 'movement-consumption'}>
                        <td className="material-date-cell">
                          {m.date
                            ? m.date.toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit'
                              })
                            : '–'}
                        </td>
                        <td>
                          <span className={`material-kind-badge ${m.kind === 'credit' ? 'badge-credit' : 'badge-consumption'}`}>
                            {m.kind === 'credit' ? 'Gutschrift' : 'Verbrauch'}
                          </span>
                        </td>
                        <td className="material-name-cell">{m.name}</td>
                        <td className={`num material-qty-cell ${m.kind === 'credit' ? 'qty-credit' : ''}`}>
                          {m.kind === 'credit' ? '−' : ''}
                          {m.quantity}
                          {m.unit ? ` ${m.unit}` : ''}
                        </td>
                        <td className="material-who-cell">{m.who}</td>
                        <td className="material-actions-cell">
                          {m.deletable && (
                            <button
                              type="button"
                              className="material-delete-btn"
                              onClick={() => handleDeleteCredit(m.id)}
                              title={m.kind === 'credit' ? 'Gutschrift löschen' : 'Verbrauch löschen'}
                              aria-label={m.kind === 'credit' ? 'Gutschrift löschen' : 'Verbrauch löschen'}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Lightbox Modal für Bildvergrößerung */}
      {renderTimeEntryLocationModal()}

      {lightboxImage && (
        <div 
          className="lightbox-overlay" 
          onClick={() => setLightboxImage(null)}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="lightbox-close" 
              onClick={() => setLightboxImage(null)}
            >
              ×
            </button>
            <img 
              src={lightboxImage.src} 
              alt={lightboxImage.fileName}
            />
            <p className="lightbox-filename">{lightboxImage.fileName}</p>
            {(lightboxImage.imageComment?.trim() || lightboxImage.notes?.trim()) && (
              <div className="lightbox-notes">
                <strong>Kommentar:</strong>
                <p>{lightboxImage.imageComment?.trim() || lightboxImage.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectDetailModal

