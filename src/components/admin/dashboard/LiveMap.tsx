import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPoint {
  id: string
  lat: number
  lng: number
  /** Kurzzeichen im Marker, z. B. Initialen. */
  label: string
  title: string
  photo?: string
}

const pin = (point: MapPoint, selected: boolean) => {
  const html = document.createElement('span')
  html.className = `live-pin${selected ? ' is-selected' : ''}`
  html.textContent = point.label
  if (point.photo) {
    const image = document.createElement('img')
    image.src = point.photo
    image.alt = ''
    image.addEventListener('error', () => image.remove(), { once: true })
    html.appendChild(image)
  }
  return L.divIcon({ html, className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
}

/** Karte mit einem Marker je eingestempeltem Mitarbeiter; die Auswahl wird angeflogen. */
export default function LiveMap({ points, selectedId, onSelect }: {
  points: MapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const select = useRef(onSelect)
  useEffect(() => { select.current = onSelect }, [onSelect])

  useEffect(() => {
    const instance = L.map(box.current!, { scrollWheelZoom: false }).setView([51.1, 10.4], 6)
    // OpenStreetMap verlangt einen Referer; die App sendet sonst keinen.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(instance)
    markers.current = L.layerGroup().addTo(instance)
    map.current = instance
    // Spaltenwechsel (Tagesblatt auf/zu) ändern die Größe; Leaflet muss neu messen.
    const resize = new ResizeObserver(() => instance.invalidateSize())
    resize.observe(box.current!)
    return () => { resize.disconnect(); instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const group = markers.current
    if (!group) return
    group.clearLayers()
    for (const point of points) {
      const selected = point.id === selectedId
      L.marker([point.lat, point.lng], { icon: pin(point, selected), title: point.title, alt: point.title, zIndexOffset: selected ? 1000 : 0 })
        .on('click', () => select.current(point.id))
        .addTo(group)
    }
  }, [points, selectedId])

  // Ausschnitt nur bei neuer Auswahl oder neuen Standorten ändern, nicht bei jedem Neuladen.
  const selected = points.find((point) => point.id === selectedId)
  const selectedLat = selected?.lat
  const selectedLng = selected?.lng
  const boundsKey = points.map((point) => `${point.lat},${point.lng}`).join('|')
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (selectedLat !== undefined && selectedLng !== undefined) {
      instance.flyTo([selectedLat, selectedLng], 16, { duration: 0.8 })
      return
    }
    const coords = boundsKey ? boundsKey.split('|').map((pair): [number, number] => {
      const [lat, lng] = pair.split(',')
      return [Number(lat), Number(lng)]
    }) : []
    if (coords.length) instance.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 15 })
  }, [selectedLat, selectedLng, boundsKey])

  return <div ref={box} className="live-map-canvas" role="region" aria-label="Standorte beim Einstempeln" />
}
