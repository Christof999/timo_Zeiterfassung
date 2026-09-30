import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { InspectionRoom, RoomObject } from '../../types/inspection'
import { bounds, polygon, wallPoints } from '../../utils/roomGeometry'

/**
 * Der gemessene Raum in 3D: Boden aus dem Grundriss, Wände hochgezogen,
 * Einrichtung als einfache Körper. Mit dem Finger drehen, mit zwei Fingern
 * zoomen. Bewusst schlicht – es geht um den Eindruck, nicht um CAD.
 *
 * Koordinaten: Skizze (x, y) wird zu (x, Höhe, y) – y der Skizze zeigt also
 * in der 3D-Ansicht zum Betrachter.
 */

const WALL_THICKNESS = 0.1

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra })

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Ein Einrichtungsgegenstand; Rückseite (Wandseite) liegt bei -z. */
function buildObject(obj: RoomObject): THREE.Group {
  const g = new THREE.Group()
  const w = obj.width
  const d = obj.depth
  const white = mat(0xf7f7f5, { roughness: 0.25 })
  switch (obj.type) {
    case 'badewanne': {
      g.add(box(w, 0.55, d, white))
      const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.02, d - 0.12), mat(0xcfe3ee, { roughness: 0.1 }))
      water.position.y = 0.5
      g.add(water)
      break
    }
    case 'dusche': {
      g.add(box(w, 0.05, d, white))
      const glass = mat(0xbfd9e6, { transparent: true, opacity: 0.35, roughness: 0.05 })
      g.add(box(0.01, 2.0, d, glass, w / 2, 0.05, 0))
      g.add(box(w, 2.0, 0.01, glass, 0, 0.05, d / 2))
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), mat(0xb0b0b0, { metalness: 0.8 }))
      head.position.set(0, 2.0, -d / 2 + 0.2)
      g.add(head)
      break
    }
    case 'wc': {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2.4, 0.4, 24), white)
      bowl.scale.z = (d - 0.15) / w
      bowl.position.set(0, 0.2, 0.075)
      bowl.castShadow = true
      g.add(bowl)
      g.add(box(w, 0.45, 0.15, white, 0, 0.35, -d / 2 + 0.075))
      break
    }
    case 'waschtisch': {
      g.add(box(w, 0.45, d, mat(0x8a6a4f), 0, 0.4, 0))
      g.add(box(w + 0.02, 0.05, d + 0.02, white, 0, 0.85, 0))
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 12), mat(0xb0b0b0, { metalness: 0.8 }))
      tap.position.set(0, 0.97, -d / 2 + 0.08)
      g.add(tap)
      const mirror = box(Math.min(w, 0.8), 0.7, 0.02, mat(0xdde8ee, { metalness: 0.9, roughness: 0.05 }), 0, 1.15, -d / 2 + 0.01)
      g.add(mirror)
      break
    }
    case 'kueche': {
      g.add(box(w, 0.86, d, mat(0xe9e4dc)))
      g.add(box(w + 0.02, 0.04, d + 0.03, mat(0x5b5b5b), 0, 0.86, 0.015))
      g.add(box(w, 0.7, 0.35, mat(0xe9e4dc), 0, 1.45, -d / 2 + 0.175))
      break
    }
    case 'tuer': {
      g.add(box(w, 2.01, Math.max(d, 0.04), mat(0x9c7a58)))
      break
    }
    case 'fenster': {
      g.add(box(w, 1.2, Math.max(d, 0.04), mat(0xbfd9e6, { transparent: true, opacity: 0.55, roughness: 0.05 }), 0, 0.9, 0))
      break
    }
  }
  g.position.set(obj.x, 0, obj.y)
  g.rotation.y = -(obj.rotation * Math.PI) / 180
  return g
}

interface Room3DProps {
  room: InspectionRoom
}

const Room3D: React.FC<Room3DProps> = ({ room }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6))
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    scene.add(sun)

    const pts = polygon(room.walls)
    const b = bounds(pts)
    const cx = (b.minX + b.maxX) / 2
    const cz = (b.minY + b.maxY) / 2
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 2)

    // Boden aus dem Grundriss
    if (pts.length >= 3) {
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)))
      const floorGeo = new THREE.ShapeGeometry(shape)
      // Shape liegt in der xy-Ebene; um x drehen legt sie auf den Boden (y wird zu z).
      floorGeo.rotateX(Math.PI / 2)
      const floor = new THREE.Mesh(floorGeo, mat(0xd9d4cc, { side: THREE.DoubleSide }))
      floor.receiveShadow = true
      scene.add(floor)
    }

    // Wände. Jede bekommt ihr eigenes Material: Wände zwischen Kamera und
    // Raum werden beim Drehen fast unsichtbar, sonst sähe man nie hinein.
    const walls: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; x: number; z: number; nx: number; nz: number }[] = []
    const all = wallPoints(room.walls)
    for (let i = 0; i < room.walls.length; i++) {
      const a = all[i]
      const c = all[i + 1]
      const len = Math.hypot(c.x - a.x, c.y - a.y)
      if (len < 0.01) continue
      const wallMaterial = mat(0xf4f1ec, { transparent: true, opacity: 1 })
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len + WALL_THICKNESS, room.height, WALL_THICKNESS), wallMaterial)
      // Wand um die halbe Stärke nach außen (links der Laufrichtung) versetzen.
      const angle = Math.atan2(c.y - a.y, c.x - a.x)
      const ox = Math.sin(angle) * (WALL_THICKNESS / 2)
      const oz = -Math.cos(angle) * (WALL_THICKNESS / 2)
      wall.position.set((a.x + c.x) / 2 + ox, room.height / 2, (a.y + c.y) / 2 + oz)
      wall.rotation.y = -angle
      wall.castShadow = true
      wall.receiveShadow = true
      scene.add(wall)
      walls.push({ mesh: wall, material: wallMaterial, x: wall.position.x, z: wall.position.z, nx: ox, nz: oz })
    }

    for (const obj of room.objects) scene.add(buildObject(obj))

    sun.position.set(cx + size * 0.3, room.height * 4, cz + size * 0.2)
    sun.target.position.set(cx, 0, cz)
    scene.add(sun.target)
    const cam = sun.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -size
    cam.right = cam.top = size
    cam.updateProjectionMatrix()

    camera.position.set(cx + size * 0.8, room.height + size * 1.1, cz + size * 1.5)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(cx, room.height * 0.35, cz)
    controls.maxPolarAngle = Math.PI * 0.49
    controls.enableDamping = true
    controls.update()

    let frame = 0
    const render = () => {
      frame = 0
      if (controls.update()) requestRender()
      for (const w of walls) {
        // Kamera auf der Außenseite der Wand → Wand fast ausblenden.
        const outside = (camera.position.x - w.x) * w.nx + (camera.position.z - w.z) * w.nz > 0
        w.material.opacity = outside ? 0.12 : 1
        w.material.depthWrite = !outside
        // Eine ausgeblendete Wand soll auch keinen Schatten in den Raum werfen.
        w.mesh.castShadow = !outside
      }
      renderer.render(scene, camera)
    }
    const requestRender = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }
    controls.addEventListener('change', requestRender)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      requestRender()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      controls.dispose()
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry.dispose()
          const m = mesh.material
          ;(Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [room])

  return <div ref={containerRef} className="room-3d" />
}

export default Room3D
