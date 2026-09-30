/**
 * Besichtigung: der Erstkontakt mit dem Kunden auf der Baustelle.
 *
 * Alles, was der Handwerker beim ersten Termin aufnimmt, steht in einem
 * Dokument der Collection `inspections`: wer, wo, was gemacht werden soll,
 * die Räume mit ihren Maßen, Fotos und KI-Visualisierungen. Das
 * Rechnungsprogramm liest dieselbe Collection und macht daraus ein Angebot.
 */

/** Eine Wand im Grundriss: Länge in Metern, danach der Innenwinkel zur nächsten Wand. */
export interface RoomWall {
  id: string
  /** Länge in Metern */
  length: number
  /** Innenwinkel am Ende dieser Wand in Grad (90 = rechter Winkel) */
  angle: number
}

export type RoomObjectType =
  | 'badewanne'
  | 'dusche'
  | 'wc'
  | 'waschtisch'
  | 'kueche'
  | 'tuer'
  | 'fenster'

/** Ein Einrichtungsgegenstand im Raum, Maße und Lage in Metern (Grundriss-Koordinaten). */
export interface RoomObject {
  id: string
  type: RoomObjectType
  /** Mittelpunkt */
  x: number
  y: number
  width: number
  depth: number
  /** Drehung in Grad */
  rotation: number
}

/** Notiz auf der Skizze, an einer Stelle im Grundriss (Meter). */
export interface SketchNote {
  id: string
  x: number
  y: number
  text: string
}

export interface InspectionRoom {
  id: string
  name: string
  /** Raumhöhe in Metern */
  height: number
  walls: RoomWall[]
  objects: RoomObject[]
  notes: SketchNote[]
}

export interface InspectionPhoto {
  id: string
  url: string
  storagePath?: string
  caption?: string
  createdAt: string
}

/** Ein KI-Bild: Raumfoto mit neuen Fliesen. */
export interface InspectionVisualization {
  id: string
  url: string
  storagePath?: string
  sourcePhotoId: string
  tileUrl?: string
  surfaces: string[]
  prompt?: string
  createdAt: string
}

/** Eine Position des Leistungsverzeichnisses, wie sie ins Angebot übernommen wird. */
export interface LvPosition {
  id: string
  /** Abschnitt, z. B. „Abdichtung“ */
  group?: string
  shortText: string
  longText?: string
  quantity: number | null
  unit: string
}

export interface InspectionGeo {
  lat: number
  lng: number
  accuracy?: number
}

export type InspectionStatus = 'offen' | 'angebot'

export interface Inspection {
  id: string
  /** Kunde aus dem Stamm, falls ausgewählt */
  customerId?: string
  /** Anzeigename – aus dem Stamm übernommen oder frei eingegeben */
  customerName: string
  customerPhone?: string
  customerEmail?: string
  address: string
  geo?: InspectionGeo
  description: string
  lvTitle?: string
  lvPositions: LvPosition[]
  rooms: InspectionRoom[]
  /** Beim Speichern abgeleitet, z. B. „Bad: Bodenfläche 6,20 m² …“ – fürs Rechnungsprogramm */
  roomSummaries?: string[]
  photos: InspectionPhoto[]
  visualizations: InspectionVisualization[]
  status: InspectionStatus
  /** Vom Rechnungsprogramm gesetzt, sobald daraus ein Angebot entstanden ist */
  offerId?: string
  offerNumber?: string
  createdBy?: string
  createdAt: Date
  updatedAt: Date
}
