import { DataService } from './dataService'
import { auth } from './firebaseConfig'
import { getEmployeeDisplayName } from '../utils/employeeDisplayName'
import { roundedSpanMs } from '../utils/timeRounding'
import { APP_DISPLAY_NAME } from '../constants/appBranding'
import type { TimeEntry, TimeEntryMaterialUsage } from '../types'

// Mörgel – der KI-Assistent fürs Admin-Panel.
// Der Gesprächs-/Tool-Loop läuft hier im Client: Die Function /api/agent ist
// nur ein Proxy zu Gemini (hält den API-Key geheim). Lese- und Schreibaktionen
// werden über den bestehenden DataService ausgeführt – exakt wie bei manuellen
// Aktionen im Dashboard. Schreibende Aktionen werden vorher per
// Bestätigungs-Callback (confirmMutation) freigegeben.
//
// Hinweis zur App: Diese Zeiterfassung erfasst neben Arbeitszeit auch das
// beim Ausstempeln verbrauchte Material (z. B. m², Stück, Sack). Material wird
// als Stückliste direkt am Zeiteintrag gespeichert (kein eigener Datensatz wie
// früher bei Fahrzeugen). Der Material-Katalog (Materialtypen) liegt separat.

export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, any> }
  functionResponse?: { name: string; response: Record<string, any> }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface AgentCallbacks {
  /** Wird vor jeder schreibenden Aktion aufgerufen. Muss true liefern, damit ausgeführt wird. */
  confirmMutation: (summary: string) => Promise<boolean>
  /** Optionaler Status für die UI (z. B. „sucht Zeiteinträge …"). */
  onStatus?: (status: string | null) => void
}

export interface AdminInfo {
  id?: string
  name?: string
}

const MAX_STEPS = 8

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function toJsDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

function fmtDateTime(value: any): string {
  const d = toJsDate(value)
  if (!d) return '—'
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function durationHours(entry: TimeEntry): number | null {
  const start = toJsDate(entry.clockInTime)
  const end = toJsDate(entry.clockOutTime)
  if (!start || !end) return null
  // Zeiten auf 15-Min-Raster glätten (einheitliche Basis)
  const grossMs = roundedSpanMs(start, end)
  const pauseMs = typeof entry.pauseTotalTime === 'number' ? entry.pauseTotalTime : 0
  return Math.max(0, (grossMs - pauseMs) / 3_600_000)
}

function pauseMinutes(entry: TimeEntry): number {
  return Math.round((entry.pauseTotalTime || 0) / 60000)
}

/** Zeiteinträge neueste zuerst (clockInTime absteigend). */
function sortEntriesNewestFirst(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort(
    (a, b) => (toJsDate(b.clockInTime)?.getTime() || 0) - (toJsDate(a.clockInTime)?.getTime() || 0)
  )
}

// Einfache Caches pro Gesprächsrunde, um Namen aufzulösen.
async function employeeNameById(id?: string): Promise<string> {
  if (!id) return '—'
  const list = await DataService.getAllEmployees()
  const e = list.find((x) => x.id === id)
  return e ? getEmployeeDisplayName(e) : id
}

async function projectNameById(id?: string): Promise<string> {
  if (!id) return '—'
  const list = await DataService.getAllProjects()
  return list.find((p) => p.id === id)?.name || id
}

async function materialNameById(id?: string): Promise<string> {
  if (!id) return '—'
  const list = await DataService.getAllMaterialTypes()
  return list.find((m) => m.id === id)?.name || id
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Tool-Deklarationen (Gemini function_declarations)
// ---------------------------------------------------------------------------

const toolDeclarations = [
  // --- Lesen ---
  {
    name: 'listeMitarbeiter',
    description:
      'Listet alle Mitarbeiter mit ID und Namen auf. Nutze dies zuerst, um die Mitarbeiter-ID zu einem Namen zu ermitteln.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'listeProjekte',
    description: 'Listet Projekte mit ID und Name auf, um die Projekt-ID zu einem Namen zu ermitteln.',
    parameters: {
      type: 'object',
      properties: {
        nurAktive: { type: 'boolean', description: 'Nur aktive Projekte zurückgeben.' }
      }
    }
  },
  {
    name: 'listeMaterialien',
    description:
      'Listet alle Materialtypen aus dem Material-Katalog mit ID, Name, Einheit (z. B. m², Stück, Sack) und Preis pro Einheit auf.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'findeZeiteintraege',
    description:
      'Letzte Zeiteinträge eines Mitarbeiters (neueste zuerst), inkl. ID, Datum, Start/Ende, Pause und Projekt.',
    parameters: {
      type: 'object',
      properties: {
        mitarbeiterId: { type: 'string' },
        anzahl: { type: 'number', description: 'Wie viele Einträge (Standard 5, max 20).' }
      },
      required: ['mitarbeiterId']
    }
  },
  {
    name: 'findeMaterialverbrauch',
    description:
      'Materialverbrauch eines Mitarbeiters: Zeiteinträge mit erfasstem Material (neueste zuerst), inkl. Zeiteintrag-ID, Datum, Projekt und Liste der Materialien mit Menge und Einheit.',
    parameters: {
      type: 'object',
      properties: {
        mitarbeiterId: { type: 'string' },
        anzahl: { type: 'number', description: 'Wie viele Zeiteinträge (Standard 10, max 30).' }
      },
      required: ['mitarbeiterId']
    }
  },
  {
    name: 'werArbeitetGerade',
    description:
      'Live-Übersicht: Welche Mitarbeiter sind aktuell eingestempelt (arbeiten gerade) – mit Projekt, Startzeit und bisheriger Arbeitsdauer.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'heutigeArbeitszeiten',
    description:
      'Wer hat heute wie lange gearbeitet: Arbeitszeit pro Mitarbeiter für heute (laufende Einträge werden bis jetzt gerechnet), inkl. Projekte und Status (läuft/abgeschlossen).',
    parameters: { type: 'object', properties: {} }
  },

  // --- Zeiteinträge ändern ---
  {
    name: 'aendereZeiten',
    description:
      'Ändert Start- und/oder Endzeit eines Zeiteintrags. Zeiten als ISO-8601 (z. B. 2026-06-05T07:00). Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        zeiteintragId: { type: 'string' },
        startZeit: { type: 'string', description: 'Neue Startzeit ISO-8601, optional.' },
        endZeit: { type: 'string', description: 'Neue Endzeit ISO-8601, optional.' }
      },
      required: ['zeiteintragId']
    }
  },
  {
    name: 'setzePauseMinuten',
    description:
      'Setzt die Gesamt-Pausenzeit eines Zeiteintrags (in Minuten). Zum Hinzufügen erst per findeZeiteintraege die aktuelle Pause lesen und addieren. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        zeiteintragId: { type: 'string' },
        pausenMinuten: { type: 'number' }
      },
      required: ['zeiteintragId', 'pausenMinuten']
    }
  },
  {
    name: 'umbucheZeiteintrag',
    description:
      'Bucht einen Zeiteintrag auf ein anderes Projekt um. Fotos, Berichte/Dokumente UND das erfasste Material werden automatisch mit umgezogen. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        zeiteintragId: { type: 'string' },
        zielProjektId: { type: 'string' }
      },
      required: ['zeiteintragId', 'zielProjektId']
    }
  },
  {
    name: 'trageZeiteintragNach',
    description:
      'Legt einen vollständigen, bereits abgeschlossenen Zeiteintrag nachträglich an (Nachtrag). Zeiten als ISO-8601. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        mitarbeiterId: { type: 'string' },
        projektId: { type: 'string' },
        startZeit: { type: 'string', description: 'ISO-8601' },
        endZeit: { type: 'string', description: 'ISO-8601' },
        pausenMinuten: { type: 'number', description: 'Optional.' },
        notiz: { type: 'string', description: 'Optional.' }
      },
      required: ['mitarbeiterId', 'projektId', 'startZeit', 'endZeit']
    }
  },
  {
    name: 'loescheZeiteintrag',
    description: 'Löscht einen Zeiteintrag dauerhaft. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: { zeiteintragId: { type: 'string' } },
      required: ['zeiteintragId']
    }
  },

  // --- Material an Zeiteinträgen ---
  {
    name: 'trageMaterialEin',
    description:
      'Fügt einem bestehenden Zeiteintrag einen Materialverbrauch hinzu (Menge eines Materialtyps). Name, Einheit und Preis werden aus dem Material-Katalog übernommen. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        zeiteintragId: { type: 'string' },
        materialId: { type: 'string', description: 'ID eines Materialtyps aus listeMaterialien.' },
        menge: { type: 'number', description: 'Verbrauchte Menge (in der Einheit des Materials).' }
      },
      required: ['zeiteintragId', 'materialId', 'menge']
    }
  },
  {
    name: 'entferneMaterialVonZeiteintrag',
    description:
      'Entfernt einen Materialtyp vollständig aus dem Materialverbrauch eines Zeiteintrags. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        zeiteintragId: { type: 'string' },
        materialId: { type: 'string' }
      },
      required: ['zeiteintragId', 'materialId']
    }
  },

  // --- Anlegen (geführt, Feld für Feld erfragen) ---
  {
    name: 'erstelleProjekt',
    description:
      'Legt ein neues Projekt an. Pflichtfeld: name. Erst aufrufen, wenn alle nötigen Felder erfragt sind. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        kunde: { type: 'string' },
        adresse: { type: 'string' },
        beschreibung: { type: 'string' },
        status: { type: 'string', description: "active | planned | completed (Standard active)" },
        startDatum: { type: 'string', description: 'YYYY-MM-DD, optional.' },
        endDatum: { type: 'string', description: 'YYYY-MM-DD, optional.' }
      },
      required: ['name']
    }
  },
  {
    name: 'erstelleMaterial',
    description:
      'Legt einen neuen Materialtyp im Katalog an. Pflichtfeld: name. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        einheit: { type: 'string', description: 'Mengeneinheit, z. B. m², Stück, Sack (Standard m²).' },
        preisProEinheit: { type: 'number', description: 'Preis pro Einheit in EUR, optional.' },
        aktiv: { type: 'boolean', description: 'Standard true.' }
      },
      required: ['name']
    }
  },
  {
    name: 'erstelleMitarbeiter',
    description:
      'Legt einen neuen Mitarbeiter an. Pflichtfelder: vorname, nachname, benutzername, passwort. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        vorname: { type: 'string' },
        nachname: { type: 'string' },
        benutzername: { type: 'string' },
        passwort: { type: 'string' },
        position: { type: 'string' },
        stundenlohn: { type: 'number' },
        status: { type: 'string', description: 'active | inactive (Standard active)' }
      },
      required: ['vorname', 'nachname', 'benutzername', 'passwort']
    }
  },

  // --- Bearbeiten ---
  {
    name: 'aendereProjekt',
    description:
      'Ändert Felder eines bestehenden Projekts. Nur angegebene Felder werden geändert. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        projektId: { type: 'string' },
        name: { type: 'string' },
        kunde: { type: 'string' },
        adresse: { type: 'string' },
        beschreibung: { type: 'string' },
        status: { type: 'string', description: 'active | planned | completed | archived' },
        startDatum: { type: 'string', description: 'YYYY-MM-DD' },
        endDatum: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['projektId']
    }
  },
  {
    name: 'aendereMaterial',
    description:
      'Ändert Felder eines Materialtyps. Nur angegebene Felder werden geändert. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        materialId: { type: 'string' },
        name: { type: 'string' },
        einheit: { type: 'string', description: 'Mengeneinheit, z. B. m², Stück, Sack.' },
        preisProEinheit: { type: 'number', description: 'Preis pro Einheit in EUR.' },
        aktiv: { type: 'boolean' }
      },
      required: ['materialId']
    }
  },
  {
    name: 'aendereMitarbeiter',
    description:
      'Ändert Felder eines Mitarbeiters. Nur angegebene Felder werden geändert. Passwort nur senden, wenn es geändert werden soll. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        mitarbeiterId: { type: 'string' },
        vorname: { type: 'string' },
        nachname: { type: 'string' },
        benutzername: { type: 'string' },
        passwort: { type: 'string' },
        position: { type: 'string' },
        stundenlohn: { type: 'number' },
        status: { type: 'string', description: 'active | inactive' }
      },
      required: ['mitarbeiterId']
    }
  },

  // --- Archivieren / Löschen ---
  {
    name: 'archiviereProjekt',
    description: 'Archiviert ein Projekt (Status archived, nicht mehr aktiv). Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: { projektId: { type: 'string' } },
      required: ['projektId']
    }
  },
  {
    name: 'loescheMaterial',
    description: 'Löscht einen Materialtyp aus dem Katalog. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: { materialId: { type: 'string' } },
      required: ['materialId']
    }
  },
  {
    name: 'deaktiviereMitarbeiter',
    description: 'Deaktiviert einen Mitarbeiter (Status inactive). Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: { mitarbeiterId: { type: 'string' } },
      required: ['mitarbeiterId']
    }
  },

  // --- Urlaubsanträge ---
  {
    name: 'listeUrlaubsantraege',
    description: 'Listet Urlaubsanträge mit ID, Mitarbeiter, Zeitraum, Typ und Status.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'pending | approved | rejected | all (Standard pending)' }
      }
    }
  },
  {
    name: 'genehmigeUrlaubsantrag',
    description: 'Genehmigt einen Urlaubsantrag. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: { urlaubsantragId: { type: 'string' } },
      required: ['urlaubsantragId']
    }
  },
  {
    name: 'lehneUrlaubsantragAb',
    description: 'Lehnt einen Urlaubsantrag ab. Schreibend – Bestätigung nötig.',
    parameters: {
      type: 'object',
      properties: {
        urlaubsantragId: { type: 'string' },
        grund: { type: 'string', description: 'Ablehnungsgrund.' }
      },
      required: ['urlaubsantragId', 'grund']
    }
  },

  // --- Berichte / Auswertung ---
  {
    name: 'mitarbeiterStunden',
    description:
      'Summiert die Arbeitsstunden eines Mitarbeiters, optional in einem Zeitraum (YYYY-MM-DD).',
    parameters: {
      type: 'object',
      properties: {
        mitarbeiterId: { type: 'string' },
        vonDatum: { type: 'string', description: 'YYYY-MM-DD, optional.' },
        bisDatum: { type: 'string', description: 'YYYY-MM-DD, optional.' }
      },
      required: ['mitarbeiterId']
    }
  },
  {
    name: 'projektStunden',
    description: 'Summiert Arbeitsstunden und den Materialverbrauch (je Material mit Menge und Kosten) eines Projekts.',
    parameters: {
      type: 'object',
      properties: { projektId: { type: 'string' } },
      required: ['projektId']
    }
  }
]

const MUTATING_TOOLS = new Set([
  'aendereZeiten',
  'setzePauseMinuten',
  'umbucheZeiteintrag',
  'trageZeiteintragNach',
  'loescheZeiteintrag',
  'trageMaterialEin',
  'entferneMaterialVonZeiteintrag',
  'erstelleProjekt',
  'erstelleMaterial',
  'erstelleMitarbeiter',
  'aendereProjekt',
  'aendereMaterial',
  'aendereMitarbeiter',
  'archiviereProjekt',
  'loescheMaterial',
  'deaktiviereMitarbeiter',
  'genehmigeUrlaubsantrag',
  'lehneUrlaubsantragAb'
])

// ---------------------------------------------------------------------------
// Zusammenfassung für die Bestätigung schreibender Aktionen
// ---------------------------------------------------------------------------

async function entryLabel(zeiteintragId?: string): Promise<string> {
  if (!zeiteintragId) return '—'
  const entry = await DataService.getTimeEntryById(zeiteintragId)
  if (!entry) return `Eintrag ${zeiteintragId}`
  return `${fmtDateTime(entry.clockInTime)} – ${fmtDateTime(entry.clockOutTime)} (${await projectNameById(
    entry.projectId
  )})`
}

async function summarizeMutation(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case 'aendereZeiten': {
      const parts: string[] = []
      if (args.startZeit) parts.push(`Start → ${fmtDateTime(args.startZeit)}`)
      if (args.endZeit) parts.push(`Ende → ${fmtDateTime(args.endZeit)}`)
      return `Zeiten ändern:\n${await entryLabel(args.zeiteintragId)}\n${parts.join('\n')}`
    }
    case 'setzePauseMinuten':
      return `Pause setzen auf ${args.pausenMinuten} Min:\n${await entryLabel(args.zeiteintragId)}`
    case 'umbucheZeiteintrag':
      return `Zeiteintrag umbuchen (inkl. Fotos, Berichte & Material):\n${await entryLabel(
        args.zeiteintragId
      )}\n→ Projekt: ${await projectNameById(args.zielProjektId)}`
    case 'trageZeiteintragNach':
      return [
        'Zeiteintrag nachtragen:',
        `Mitarbeiter: ${await employeeNameById(args.mitarbeiterId)}`,
        `Projekt: ${await projectNameById(args.projektId)}`,
        `Zeit: ${fmtDateTime(args.startZeit)} – ${fmtDateTime(args.endZeit)}`,
        args.pausenMinuten ? `Pause: ${args.pausenMinuten} Min` : null,
        args.notiz ? `Notiz: ${args.notiz}` : null
      ]
        .filter(Boolean)
        .join('\n')
    case 'loescheZeiteintrag':
      return `Zeiteintrag LÖSCHEN (unwiderruflich):\n${await entryLabel(args.zeiteintragId)}`
    case 'trageMaterialEin':
      return [
        'Material eintragen:',
        `${args.menge} × ${await materialNameById(args.materialId)}`,
        `→ Zeiteintrag: ${await entryLabel(args.zeiteintragId)}`
      ].join('\n')
    case 'entferneMaterialVonZeiteintrag':
      return `Material entfernen: ${await materialNameById(args.materialId)}\n→ Zeiteintrag: ${await entryLabel(
        args.zeiteintragId
      )}`
    case 'erstelleProjekt':
      return [
        'Neues Projekt anlegen:',
        `Name: ${args.name}`,
        args.kunde ? `Kunde: ${args.kunde}` : null,
        args.adresse ? `Adresse: ${args.adresse}` : null,
        args.beschreibung ? `Beschreibung: ${args.beschreibung}` : null,
        `Status: ${args.status || 'active'}`,
        args.startDatum ? `Start: ${args.startDatum}` : null,
        args.endDatum ? `Ende: ${args.endDatum}` : null
      ]
        .filter(Boolean)
        .join('\n')
    case 'erstelleMaterial':
      return [
        'Neuen Materialtyp anlegen:',
        `Name: ${args.name}`,
        `Einheit: ${args.einheit || 'm²'}`,
        args.preisProEinheit != null ? `Preis/Einheit: ${args.preisProEinheit} €` : null,
        `Aktiv: ${args.aktiv === false ? 'nein' : 'ja'}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'erstelleMitarbeiter':
      return [
        'Neuen Mitarbeiter anlegen:',
        `Name: ${args.vorname} ${args.nachname}`,
        `Benutzername: ${args.benutzername}`,
        args.position ? `Position: ${args.position}` : null,
        args.stundenlohn != null ? `Stundenlohn: ${args.stundenlohn} €` : null,
        `Status: ${args.status || 'active'}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'aendereProjekt': {
      const felder = changedFieldsSummary(args, {
        name: 'Name',
        kunde: 'Kunde',
        adresse: 'Adresse',
        beschreibung: 'Beschreibung',
        status: 'Status',
        startDatum: 'Start',
        endDatum: 'Ende'
      })
      return `Projekt ändern: ${await projectNameById(args.projektId)}\n${felder}`
    }
    case 'aendereMaterial': {
      const felder = changedFieldsSummary(args, {
        name: 'Name',
        einheit: 'Einheit',
        preisProEinheit: 'Preis/Einheit',
        aktiv: 'Aktiv'
      })
      return `Material ändern: ${await materialNameById(args.materialId)}\n${felder}`
    }
    case 'aendereMitarbeiter': {
      const felder = changedFieldsSummary(args, {
        vorname: 'Vorname',
        nachname: 'Nachname',
        benutzername: 'Benutzername',
        passwort: 'Passwort',
        position: 'Position',
        stundenlohn: 'Stundenlohn',
        status: 'Status'
      })
      return `Mitarbeiter ändern: ${await employeeNameById(args.mitarbeiterId)}\n${felder}`
    }
    case 'archiviereProjekt':
      return `Projekt ARCHIVIEREN: ${await projectNameById(args.projektId)}`
    case 'loescheMaterial':
      return `Materialtyp LÖSCHEN: ${await materialNameById(args.materialId)}`
    case 'deaktiviereMitarbeiter':
      return `Mitarbeiter DEAKTIVIEREN: ${await employeeNameById(args.mitarbeiterId)}`
    case 'genehmigeUrlaubsantrag':
      return `Urlaubsantrag GENEHMIGEN:\n${await leaveLabel(args.urlaubsantragId)}`
    case 'lehneUrlaubsantragAb':
      return `Urlaubsantrag ABLEHNEN:\n${await leaveLabel(args.urlaubsantragId)}\nGrund: ${args.grund}`
    default:
      return `Aktion ${name} ausführen?`
  }
}

function changedFieldsSummary(args: Record<string, any>, labels: Record<string, string>): string {
  const lines = Object.entries(labels)
    .filter(([key]) => args[key] !== undefined && args[key] !== '')
    .map(([key, label]) => {
      if (key === 'passwort') return `${label} → (geändert)`
      if (key === 'aktiv') return `${label} → ${args[key] ? 'ja' : 'nein'}`
      return `${label} → ${args[key]}`
    })
  return lines.length ? lines.join('\n') : '(keine Felder angegeben)'
}

async function leaveLabel(id?: string): Promise<string> {
  if (!id) return '—'
  const all = await DataService.getAllLeaveRequests()
  const r = all.find((x) => x.id === id)
  if (!r) return `Antrag ${id}`
  return `${r.employeeName || (await employeeNameById(r.employeeId))}: ${fmtDateTime(
    r.startDate
  )} – ${fmtDateTime(r.endDate)} (${r.type})`
}

// ---------------------------------------------------------------------------
// Tool-Implementierungen
// ---------------------------------------------------------------------------

async function executeTool(
  name: string,
  args: Record<string, any>,
  callbacks: AgentCallbacks,
  admin: AdminInfo
): Promise<Record<string, any>> {
  if (MUTATING_TOOLS.has(name)) {
    const ok = await callbacks.confirmMutation(await summarizeMutation(name, args))
    if (!ok) {
      return { status: 'abgebrochen', message: 'Der Administrator hat die Aktion abgelehnt.' }
    }
  }

  switch (name) {
    // --- Lesen ---
    case 'listeMitarbeiter': {
      const employees = await DataService.getAllEmployees()
      return {
        mitarbeiter: employees.map((e) => ({
          id: e.id,
          name: getEmployeeDisplayName(e),
          status: e.status || 'active'
        }))
      }
    }
    case 'listeProjekte': {
      const projects = await DataService.getAllProjects()
      const filtered = args.nurAktive
        ? projects.filter((p) => p.isActive !== false && p.status !== 'archived')
        : projects
      return {
        projekte: filtered.map((p) => ({ id: p.id, name: p.name || p.id, status: p.status || 'active' }))
      }
    }
    case 'listeMaterialien': {
      const materials = await DataService.getAllMaterialTypes()
      return {
        materialien: materials.map((m) => ({
          id: m.id,
          name: m.name,
          einheit: m.unitLabel || 'm²',
          preisProEinheit: m.unitPriceEur ?? null,
          aktiv: m.isActive !== false
        }))
      }
    }
    case 'findeZeiteintraege': {
      const anzahl = Math.min(Math.max(Number(args.anzahl) || 5, 1), 20)
      const all = await DataService.getTimeEntriesByEmployeeId(args.mitarbeiterId)
      const entries = sortEntriesNewestFirst(all).slice(0, anzahl)
      const projects = await DataService.getAllProjects()
      const nameOf = (id: string) => projects.find((p) => p.id === id)?.name || id
      return {
        zeiteintraege: entries.map((e) => ({
          id: e.id,
          start: fmtDateTime(e.clockInTime),
          ende: e.clockOutTime ? fmtDateTime(e.clockOutTime) : 'läuft noch',
          pausenMinuten: pauseMinutes(e),
          projektId: e.projectId,
          projektName: nameOf(e.projectId),
          dauerStunden: durationHours(e)?.toFixed(2) ?? null,
          anzahlMaterialPositionen: (e.materialUsages || []).length
        }))
      }
    }
    case 'findeMaterialverbrauch': {
      const anzahl = Math.min(Math.max(Number(args.anzahl) || 10, 1), 30)
      const all = await DataService.getTimeEntriesByEmployeeId(args.mitarbeiterId)
      const withMaterial = sortEntriesNewestFirst(all)
        .filter((e) => (e.materialUsages || []).length > 0)
        .slice(0, anzahl)
      const projects = await DataService.getAllProjects()
      const nameOf = (id: string) => projects.find((p) => p.id === id)?.name || id
      return {
        zeiteintraege: withMaterial.map((e) => ({
          zeiteintragId: e.id,
          datum: fmtDateTime(e.clockInTime),
          projektId: e.projectId,
          projektName: nameOf(e.projectId),
          materialien: (e.materialUsages || []).map((m) => ({
            materialId: m.materialTypeId,
            material: m.materialName || m.materialTypeId,
            menge: m.quantity,
            einheit: m.unitLabel || ''
          }))
        }))
      }
    }

    case 'werArbeitetGerade': {
      const entries = await DataService.getCurrentTimeEntries()
      const employees = await DataService.getAllEmployees()
      const projects = await DataService.getAllProjects()
      const empName = (id: string) => {
        const e = employees.find((x) => x.id === id)
        return e ? getEmployeeDisplayName(e) : id
      }
      const projName = (id: string) => projects.find((p) => p.id === id)?.name || id
      const now = Date.now()
      const aktiveMitarbeiter = entries
        .map((e) => {
          const start = toJsDate(e.clockInTime)
          const pauseMs = typeof e.pauseTotalTime === 'number' ? e.pauseTotalTime : 0
          const stunden = start ? Math.max(0, (now - start.getTime() - pauseMs) / 3_600_000) : null
          return {
            mitarbeiter: empName(e.employeeId),
            projekt: projName(e.projectId),
            seit: fmtDateTime(e.clockInTime),
            bisherStunden: stunden != null ? Math.round(stunden * 100) / 100 : null
          }
        })
        .sort((a, b) => (b.bisherStunden || 0) - (a.bisherStunden || 0))
      return { anzahlAktiv: aktiveMitarbeiter.length, aktiveMitarbeiter }
    }
    case 'heutigeArbeitszeiten': {
      const entries = await DataService.getTodaysTimeEntries()
      const employees = await DataService.getAllEmployees()
      const projects = await DataService.getAllProjects()
      const empName = (id: string) => {
        const e = employees.find((x) => x.id === id)
        return e ? getEmployeeDisplayName(e) : id
      }
      const projName = (id: string) => projects.find((p) => p.id === id)?.name || id
      const now = Date.now()
      const byEmp = new Map<
        string,
        { mitarbeiter: string; gesamtStunden: number; laeuftNoch: boolean; eintraege: any[] }
      >()
      for (const e of entries) {
        const start = toJsDate(e.clockInTime)
        if (!start) continue
        const laeuft = e.clockOutTime == null
        let stunden: number
        if (laeuft) {
          const pauseMs = typeof e.pauseTotalTime === 'number' ? e.pauseTotalTime : 0
          stunden = Math.max(0, (now - start.getTime() - pauseMs) / 3_600_000)
        } else {
          stunden = durationHours(e) || 0
        }
        const cur = byEmp.get(e.employeeId) || {
          mitarbeiter: empName(e.employeeId),
          gesamtStunden: 0,
          laeuftNoch: false,
          eintraege: []
        }
        cur.gesamtStunden += stunden
        cur.laeuftNoch = cur.laeuftNoch || laeuft
        cur.eintraege.push({
          projekt: projName(e.projectId),
          start: fmtDateTime(e.clockInTime),
          ende: e.clockOutTime ? fmtDateTime(e.clockOutTime) : 'läuft noch',
          stunden: Math.round(stunden * 100) / 100
        })
        byEmp.set(e.employeeId, cur)
      }
      const mitarbeiter = Array.from(byEmp.values())
        .map((m) => ({ ...m, gesamtStunden: Math.round(m.gesamtStunden * 100) / 100 }))
        .sort((a, b) => b.gesamtStunden - a.gesamtStunden)
      const heute = new Date().toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      return { datum: heute, anzahlMitarbeiter: mitarbeiter.length, mitarbeiter }
    }

    // --- Zeiteinträge ändern ---
    case 'aendereZeiten': {
      const update: Partial<TimeEntry> = {}
      if (args.startZeit) {
        const d = parseIsoDate(args.startZeit)
        if (!d) return { status: 'fehler', message: 'Startzeit ungültig.' }
        update.clockInTime = d
      }
      if (args.endZeit) {
        const d = parseIsoDate(args.endZeit)
        if (!d) return { status: 'fehler', message: 'Endzeit ungültig.' }
        update.clockOutTime = d
      }
      if (Object.keys(update).length === 0) {
        return { status: 'fehler', message: 'Keine Zeit angegeben.' }
      }
      await DataService.updateTimeEntry(args.zeiteintragId, update)
      return { status: 'erledigt', message: 'Zeiten wurden aktualisiert.' }
    }
    case 'setzePauseMinuten': {
      const min = Math.max(0, Math.round(Number(args.pausenMinuten) || 0))
      await DataService.updateTimeEntry(args.zeiteintragId, { pauseTotalTime: min * 60000 })
      return { status: 'erledigt', message: `Pause auf ${min} Minuten gesetzt.` }
    }
    case 'umbucheZeiteintrag': {
      await DataService.moveTimeEntryToProject(args.zeiteintragId, args.zielProjektId, {
        targetProjectName: await projectNameById(args.zielProjektId)
      })
      return {
        status: 'erledigt',
        message: 'Zeiteintrag inkl. Fotos, Berichte und Material umgebucht.'
      }
    }
    case 'trageZeiteintragNach': {
      const clockIn = parseIsoDate(args.startZeit)
      const clockOut = parseIsoDate(args.endZeit)
      if (!clockIn || !clockOut) return { status: 'fehler', message: 'Start-/Endzeit ungültig.' }
      const created = await DataService.addManualCompletedTimeEntry({
        targetEmployeeId: args.mitarbeiterId,
        projectId: args.projektId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        pauseTotalTimeMs: args.pausenMinuten ? Math.round(Number(args.pausenMinuten)) * 60000 : 0,
        notes: args.notiz,
        addedByEmployeeId: admin.id || 'admin',
        addedByDisplayName: admin.name || 'Administrator'
      })
      return { status: 'erledigt', message: 'Zeiteintrag nachgetragen.', id: created.id }
    }
    case 'loescheZeiteintrag': {
      await DataService.deleteTimeEntry(args.zeiteintragId)
      return { status: 'erledigt', message: 'Zeiteintrag wurde gelöscht.' }
    }

    // --- Material an Zeiteinträgen ---
    case 'trageMaterialEin': {
      const menge = Number(args.menge)
      if (!(menge > 0)) return { status: 'fehler', message: 'Menge muss größer 0 sein.' }
      const entry = await DataService.getTimeEntryById(args.zeiteintragId)
      if (!entry) return { status: 'fehler', message: 'Zeiteintrag nicht gefunden.' }
      const materials = await DataService.getAllMaterialTypes()
      const material = materials.find((m) => m.id === args.materialId)
      if (!material) return { status: 'fehler', message: 'Materialtyp nicht gefunden.' }
      // Firestore lehnt undefined ab (auch verschachtelt in Arrays) – optionale Felder nur setzen, wenn vorhanden.
      const usage: TimeEntryMaterialUsage = {
        materialTypeId: material.id,
        materialName: material.name,
        quantity: menge,
        ...(material.unitLabel != null ? { unitLabel: material.unitLabel } : {}),
        ...(material.unitPriceEur != null ? { unitPriceEur: material.unitPriceEur } : {})
      }
      const updated = [...(entry.materialUsages || []), usage]
      await DataService.updateTimeEntry(args.zeiteintragId, { materialUsages: updated })
      return {
        status: 'erledigt',
        message: `Material eingetragen: ${menge} ${material.unitLabel || ''} ${material.name}.`.trim()
      }
    }
    case 'entferneMaterialVonZeiteintrag': {
      const entry = await DataService.getTimeEntryById(args.zeiteintragId)
      if (!entry) return { status: 'fehler', message: 'Zeiteintrag nicht gefunden.' }
      const before = entry.materialUsages || []
      const updated = before.filter((m) => m.materialTypeId !== args.materialId)
      if (updated.length === before.length) {
        return { status: 'fehler', message: 'Dieser Materialtyp ist im Zeiteintrag nicht erfasst.' }
      }
      await DataService.updateTimeEntry(args.zeiteintragId, { materialUsages: updated })
      return { status: 'erledigt', message: 'Material vom Zeiteintrag entfernt.' }
    }

    // --- Anlegen ---
    case 'erstelleProjekt': {
      if (!args.name?.trim()) return { status: 'fehler', message: 'Projektname fehlt.' }
      const status = ['active', 'planned', 'completed'].includes(args.status) ? args.status : 'active'
      const payload: Record<string, any> = {
        name: args.name.trim(),
        client: args.kunde,
        address: args.adresse,
        description: args.beschreibung,
        status,
        isActive: status === 'active'
      }
      if (args.startDatum) payload.startDate = parseIsoDate(args.startDatum) || undefined
      if (args.endDatum) payload.endDate = parseIsoDate(args.endDatum) || undefined
      const id = await DataService.createProject(payload)
      return { status: 'erledigt', message: 'Projekt angelegt.', id }
    }
    case 'erstelleMaterial': {
      if (!args.name?.trim()) return { status: 'fehler', message: 'Materialname fehlt.' }
      const id = await DataService.createMaterialType({
        name: args.name.trim(),
        unitLabel: args.einheit?.trim() || 'm²',
        unitPriceEur: args.preisProEinheit != null ? Number(args.preisProEinheit) : undefined,
        isActive: args.aktiv !== false
      })
      return { status: 'erledigt', message: 'Materialtyp angelegt.', id }
    }
    case 'erstelleMitarbeiter': {
      for (const f of ['vorname', 'nachname', 'benutzername', 'passwort']) {
        if (!args[f]?.toString().trim()) {
          return { status: 'fehler', message: `Pflichtfeld fehlt: ${f}` }
        }
      }
      const status = args.status === 'inactive' ? 'inactive' : 'active'
      try {
        const id = await DataService.createEmployee({
          firstName: args.vorname.trim(),
          lastName: args.nachname.trim(),
          name: `${args.vorname.trim()} ${args.nachname.trim()}`,
          username: args.benutzername.trim(),
          password: args.passwort,
          position: args.position,
          hourlyRate: args.stundenlohn != null ? Number(args.stundenlohn) : undefined,
          status
        })
        return { status: 'erledigt', message: 'Mitarbeiter angelegt.', id }
      } catch (error: any) {
        return { status: 'fehler', message: error?.message || 'Anlegen fehlgeschlagen.' }
      }
    }

    // --- Bearbeiten ---
    case 'aendereProjekt': {
      const update: Record<string, any> = {}
      if (args.name !== undefined) update.name = args.name
      if (args.kunde !== undefined) update.client = args.kunde
      if (args.adresse !== undefined) update.address = args.adresse
      if (args.beschreibung !== undefined) update.description = args.beschreibung
      if (args.status !== undefined && ['active', 'planned', 'completed', 'archived'].includes(args.status)) {
        update.status = args.status
        update.isActive = args.status === 'active'
      }
      if (args.startDatum) update.startDate = parseIsoDate(args.startDatum) || undefined
      if (args.endDatum) update.endDate = parseIsoDate(args.endDatum) || undefined
      if (Object.keys(update).length === 0) return { status: 'fehler', message: 'Keine Felder angegeben.' }
      await DataService.updateProject(args.projektId, update)
      return { status: 'erledigt', message: 'Projekt aktualisiert.' }
    }
    case 'aendereMaterial': {
      const update: Record<string, any> = {}
      if (args.name !== undefined) update.name = args.name
      if (args.einheit !== undefined) update.unitLabel = args.einheit
      if (args.preisProEinheit !== undefined) update.unitPriceEur = Number(args.preisProEinheit)
      if (args.aktiv !== undefined) update.isActive = !!args.aktiv
      if (Object.keys(update).length === 0) return { status: 'fehler', message: 'Keine Felder angegeben.' }
      await DataService.updateMaterialType(args.materialId, update)
      return { status: 'erledigt', message: 'Materialtyp aktualisiert.' }
    }
    case 'aendereMitarbeiter': {
      const update: Record<string, any> = {}
      if (args.vorname !== undefined) update.firstName = args.vorname
      if (args.nachname !== undefined) update.lastName = args.nachname
      if (args.vorname !== undefined || args.nachname !== undefined) {
        const existing = await DataService.getAllEmployees()
        const cur = existing.find((e) => e.id === args.mitarbeiterId)
        update.name = `${args.vorname ?? cur?.firstName ?? ''} ${args.nachname ?? cur?.lastName ?? ''}`.trim()
      }
      if (args.benutzername !== undefined) update.username = args.benutzername
      if (args.passwort) update.password = args.passwort
      if (args.position !== undefined) update.position = args.position
      if (args.stundenlohn !== undefined) update.hourlyRate = Number(args.stundenlohn)
      if (args.status !== undefined && ['active', 'inactive'].includes(args.status)) update.status = args.status
      if (Object.keys(update).length === 0) return { status: 'fehler', message: 'Keine Felder angegeben.' }
      try {
        await DataService.updateEmployee(args.mitarbeiterId, update)
        return { status: 'erledigt', message: 'Mitarbeiter aktualisiert.' }
      } catch (error: any) {
        return { status: 'fehler', message: error?.message || 'Aktualisierung fehlgeschlagen.' }
      }
    }

    // --- Archivieren / Löschen ---
    case 'archiviereProjekt': {
      await DataService.deleteProject(args.projektId)
      return { status: 'erledigt', message: 'Projekt archiviert.' }
    }
    case 'loescheMaterial': {
      await DataService.deleteMaterialType(args.materialId)
      return { status: 'erledigt', message: 'Materialtyp gelöscht.' }
    }
    case 'deaktiviereMitarbeiter': {
      try {
        await DataService.deleteEmployee(args.mitarbeiterId)
        return { status: 'erledigt', message: 'Mitarbeiter deaktiviert.' }
      } catch (error: any) {
        return { status: 'fehler', message: error?.message || 'Deaktivierung fehlgeschlagen.' }
      }
    }

    // --- Urlaubsanträge ---
    case 'listeUrlaubsantraege': {
      const all = await DataService.getAllLeaveRequests()
      const filter = ['pending', 'approved', 'rejected'].includes(args.status) ? args.status : null
      const filtered = filter ? all.filter((r) => r.status === filter) : all
      return {
        urlaubsantraege: await Promise.all(
          filtered.map(async (r) => ({
            id: r.id,
            mitarbeiter: r.employeeName || (await employeeNameById(r.employeeId)),
            von: fmtDateTime(r.startDate),
            bis: fmtDateTime(r.endDate),
            typ: r.type,
            tage: r.workingDays,
            status: r.status
          }))
        )
      }
    }
    case 'genehmigeUrlaubsantrag': {
      await DataService.approveLeaveRequest(args.urlaubsantragId, admin.name || 'Administrator')
      return { status: 'erledigt', message: 'Urlaubsantrag genehmigt.' }
    }
    case 'lehneUrlaubsantragAb': {
      await DataService.rejectLeaveRequest(args.urlaubsantragId, args.grund || '')
      return { status: 'erledigt', message: 'Urlaubsantrag abgelehnt.' }
    }

    // --- Berichte ---
    case 'mitarbeiterStunden': {
      const von = args.vonDatum ? parseIsoDate(args.vonDatum) : null
      const bis = args.bisDatum ? parseIsoDate(args.bisDatum) : null
      if (bis) bis.setHours(23, 59, 59, 999)
      // Serverseitig vorfiltern; die Schleife unten filtert zur Sicherheit nach
      const entries = await DataService.getTimeEntriesByEmployeeId(args.mitarbeiterId, {
        from: von ?? undefined,
        to: bis ?? undefined
      })
      let summe = 0
      let anzahl = 0
      for (const e of entries) {
        const start = toJsDate(e.clockInTime)
        if (!start) continue
        if (von && start.getTime() < von.getTime()) continue
        if (bis && start.getTime() > bis.getTime()) continue
        const h = durationHours(e)
        if (h != null) {
          summe += h
          anzahl++
        }
      }
      return {
        mitarbeiter: await employeeNameById(args.mitarbeiterId),
        zeitraum: `${args.vonDatum || 'Anfang'} – ${args.bisDatum || 'heute'}`,
        anzahlEintraege: anzahl,
        gesamtStunden: Math.round(summe * 100) / 100
      }
    }
    case 'projektStunden': {
      const entries = await DataService.getTimeEntriesByProject(args.projektId)
      let arbeit = 0
      for (const e of entries) {
        const h = durationHours(e)
        if (h != null) arbeit += h
      }
      // Material über alle Zeiteinträge des Projekts aggregieren
      const materialMap = new Map<string, { material: string; einheit: string; menge: number; kostenEur: number }>()
      for (const e of entries) {
        for (const m of e.materialUsages || []) {
          const key = m.materialTypeId || m.materialName || 'unbekannt'
          const prev = materialMap.get(key) || {
            material: m.materialName || m.materialTypeId || 'Unbekannt',
            einheit: m.unitLabel || '',
            menge: 0,
            kostenEur: 0
          }
          const menge = Number(m.quantity) || 0
          prev.menge += menge
          if (typeof m.unitPriceEur === 'number') prev.kostenEur += menge * m.unitPriceEur
          materialMap.set(key, prev)
        }
      }
      const material = Array.from(materialMap.values()).map((m) => ({
        material: m.material,
        einheit: m.einheit,
        menge: Math.round(m.menge * 100) / 100,
        kostenEur: Math.round(m.kostenEur * 100) / 100
      }))
      const materialKostenGesamt = Math.round(material.reduce((sum, m) => sum + m.kostenEur, 0) * 100) / 100
      return {
        projekt: await projectNameById(args.projektId),
        arbeitsStunden: Math.round(arbeit * 100) / 100,
        anzahlZeiteintraege: entries.length,
        material,
        materialKostenGesamt
      }
    }

    default:
      return { status: 'fehler', message: `Unbekannte Aktion: ${name}` }
  }
}

// ---------------------------------------------------------------------------
// System-Instruction + API-Aufruf
// ---------------------------------------------------------------------------

function buildSystemInstruction(admin: AdminInfo): string {
  const heute = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  return [
    `Du bist „Mörgel", der freundliche KI-Assistent im Admin-Panel der ${APP_DISPLAY_NAME}.`,
    `Du hilfst dem Administrator${admin.name ? ` (${admin.name})` : ''}, die App umfassend zu steuern: Zeiteinträge ändern/anlegen/umbuchen/löschen, Pausen setzen, Materialverbrauch an Zeiteinträgen eintragen/entfernen, Materialtypen (Katalog) anlegen/bearbeiten/löschen, Projekte/Mitarbeiter anlegen, bearbeiten und archivieren/deaktivieren, Urlaubsanträge anzeigen/genehmigen/ablehnen sowie Stunden- und Material-Auswertungen für Mitarbeiter und Projekte erstellen.`,
    'Du kannst außerdem live Auskunft geben, wer gerade arbeitet (werArbeitetGerade) und wer heute wie lange gearbeitet hat (heutigeArbeitszeiten). Laufende Einträge werden dabei bis zum aktuellen Zeitpunkt gerechnet.',
    'Materialverbrauch (z. B. m², Stück, Sack) wird direkt an einem Zeiteintrag erfasst. Der Material-Katalog (Materialtypen mit Einheit und Preis) ist davon getrennt.',
    `Heutiges Datum: ${heute}. Rechne relative Angaben wie „gestern" oder „letzten Montag" in konkrete Daten um.`,
    'Antworte immer auf Deutsch, kurz und klar.',
    'Ermittle IDs IMMER zuerst über die Lese-Funktionen (listeMitarbeiter, listeProjekte, listeMaterialien, findeZeiteintraege, findeMaterialverbrauch). Erfinde niemals IDs.',
    'Wenn etwas mehrdeutig ist (mehrere passende Mitarbeiter/Projekte/Materialien oder unklar, welcher Eintrag gemeint ist), frage nach, bevor du handelst.',
    'SEHR WICHTIG – Bestätigungen: Frage NIEMALS im Text mit „Ist das korrekt?", „Soll ich …?" o. Ä. nach einer Bestätigung für schreibende Aktionen. Die App blendet bei jeder schreibenden Aktion automatisch eine eigene Bestätigungskarte (Ja/Abbrechen) ein – das ist die EINZIGE und ausreichende Bestätigung. Sobald dir alle nötigen Angaben vorliegen, rufe die passende Funktion DIREKT auf, ohne weitere Textrückfrage.',
    'Wenn der Nutzer eine schreibende Aktion bereits beauftragt hat und alle Pflichtangaben (inkl. aufgelöster IDs) vorhanden sind, rufe die Funktion sofort auf. Sage NICHT „ich benötige noch deine Bestätigung" – das übernimmt die Bestätigungskarte.',
    'Beim Anlegen von Projekt, Materialtyp oder Mitarbeiter: Wenn ein Pflichtfeld fehlt, frage gezielt danach (ein Feld pro Nachricht). Liegen alle Pflichtfelder vor, rufe die erstelle-Funktion direkt auf (die Bestätigungskarte erscheint dann automatisch).',
    'Berücksichtige IMMER den gesamten bisherigen Gesprächsverlauf. Frage NIEMALS nach einer Angabe, die der Nutzer bereits genannt hat (z. B. Name oder Kunde eines Projekts) – übernimm sie direkt. Beispiel: Hat der Nutzer „Test Agent, Kunde Sörgel" gesagt, ist der Projektname „Test Agent" und der Kunde „Sörgel".',
    'Beim Umbuchen eines Zeiteintrags werden Fotos, Berichte/Dokumente und das erfasste Material automatisch mitgenommen – erwähne das kurz.',
    'Nach erledigten Aktionen bestätige knapp das Ergebnis (z. B. „Erledigt – Zeiteintrag nachgetragen.").'
  ].join(' ')
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Nicht angemeldet – bitte neu einloggen.')
  return user.getIdToken()
}

async function callAgentApi(contents: GeminiContent[], systemInstruction: string): Promise<GeminiPart[]> {
  const idToken = await getIdToken()
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      mode: 'chat',
      contents,
      systemInstruction,
      tools: [{ function_declarations: toolDeclarations }]
    })
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `HTTP ${response.status}`)
  }
  return (data.parts || []) as GeminiPart[]
}

/** Sprachnachricht (base64) zu Text transkribieren. */
export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const idToken = await getIdToken()
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ mode: 'transcribe', audio: base64Audio, mimeType })
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `HTTP ${response.status}`)
  }
  return (data.text || '').trim()
}

// ---------------------------------------------------------------------------
// Haupt-Loop für eine Konversationsrunde
// ---------------------------------------------------------------------------

export async function runAgentTurn(
  contents: GeminiContent[],
  admin: AdminInfo,
  callbacks: AgentCallbacks
): Promise<{ reply: string; contents: GeminiContent[] }> {
  const systemInstruction = buildSystemInstruction(admin)
  const working = [...contents]

  for (let step = 0; step < MAX_STEPS; step++) {
    callbacks.onStatus?.(step === 0 ? 'denkt nach …' : 'arbeitet …')
    const parts = await callAgentApi(working, systemInstruction)

    const functionCalls = parts.filter((p) => p.functionCall)
    if (functionCalls.length === 0) {
      callbacks.onStatus?.(null)
      const reply = parts
        .map((p) => p.text || '')
        .join('')
        .trim()
      // Auch die reine Text-Antwort als Modell-Turn im Verlauf behalten, damit
      // Mörgel in der nächsten Runde weiß, was er gefragt/gesagt hat und nicht
      // bereits genannte Angaben erneut erfragt.
      working.push({ role: 'model', parts: reply ? [{ text: reply }] : parts })
      return { reply: reply || 'Okay.', contents: working }
    }

    working.push({ role: 'model', parts })

    const responseParts: GeminiPart[] = []
    for (const part of functionCalls) {
      const call = part.functionCall!
      callbacks.onStatus?.(`führt „${call.name}" aus …`)
      let result: Record<string, any>
      try {
        result = await executeTool(call.name, call.args || {}, callbacks, admin)
      } catch (error: any) {
        result = { status: 'fehler', message: error?.message || 'Unbekannter Fehler' }
      }
      responseParts.push({ functionResponse: { name: call.name, response: result } })
    }
    working.push({ role: 'user', parts: responseParts })
  }

  callbacks.onStatus?.(null)
  return {
    reply: 'Das wurde mir zu komplex – bitte formuliere die Aufgabe in einzelnen Schritten.',
    contents: working
  }
}
