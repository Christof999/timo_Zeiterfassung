#!/usr/bin/env node
/**
 * Diagnose: Warum zeigt die Nachkalkulation eines Projekts nichts an?
 *
 * Hintergrund: Nachkalkulation und Projekt-Tagesjournal laden AUSSCHLIESSLICH
 * über `timeEntries.projectId == <Projekt-Dokument-ID>`. Steht auf den
 * Stempelsätzen eine andere (oder gar keine) projectId, bleibt der Bericht
 * leer — obwohl Zeit und Material erfasst wurden. Typische Ursachen:
 *
 *   1. Doppeltes Projekt: einmal von Hand angelegt, einmal über den HERO-Sync.
 *      Gebucht wurde auf Dokument A, ausgewertet wird Dokument B.
 *   2. Kleinauftrag: Der Mitarbeiter hat über „Kunde (Kleinauftrag)"
 *      eingestempelt. Dann ist projectId leer und nur customerId gesetzt —
 *      solche Sätze tauchen in KEINER Projekt-Nachkalkulation auf.
 *   3. Verwaiste Sätze: projectId zeigt auf ein gelöschtes Projektdokument.
 *
 * Das Skript liest nur (keine Schreibvorgänge) und gibt aus, welcher Fall
 * vorliegt und auf welcher ID die Buchungen tatsächlich liegen.
 *
 * Voraussetzungen (Umgebungsvariablen, wie bei den Vercel-Functions):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * Aufruf:
 *   node scripts/diagnose-project.mjs "Strobel"
 *   node scripts/diagnose-project.mjs "BV Strobel Hattenhof"
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const SEARCH = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim()

if (!SEARCH) {
  console.error('Bitte einen Suchbegriff angeben, z. B.:')
  console.error('  node scripts/diagnose-project.mjs "Strobel"')
  process.exit(1)
}

for (const name of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
  if (!process.env[name]) {
    console.error(`Fehlende Umgebungsvariable: ${name}`)
    process.exit(1)
  }
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
})

const db = getFirestore()
const needle = SEARCH.toLowerCase()

const toDate = (value) => {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const fmtDate = (d) => (d ? d.toLocaleDateString('de-DE') : '—')
const fmtTime = (d) => (d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—')

/** 15-Minuten-Raster wie in der App (utils/timeRounding.ts). */
const roundToStep = (date) => {
  if (!date) return null
  const minutes = date.getHours() * 60 + date.getMinutes()
  const snapped = Math.round(minutes / 15) * 15
  const out = new Date(date)
  out.setHours(0, snapped, 0, 0)
  return out
}

const entryHours = (entry) => {
  const cin = roundToStep(toDate(entry.clockInTime))
  const cout = roundToStep(toDate(entry.clockOutTime))
  if (!cin || !cout) return 0
  const ms = cout.getTime() - cin.getTime() - (entry.pauseTotalTime || 0) + (entry.returnTravelCreditMs || 0)
  return Math.max(0, ms) / 3_600_000
}

const materialLines = (entry) => [
  ...(entry.materialUsages || []),
  ...(entry.materialCreditUsages || [])
]

const hit = (value) => String(value || '').toLowerCase().includes(needle)

async function main() {
  console.log(`\n=== Diagnose für Suchbegriff "${SEARCH}" ===\n`)

  const [projectsSnap, customersSnap, entriesSnap, employeesSnap, creditsSnap] = await Promise.all([
    db.collection('projects').get(),
    db.collection('customers').get(),
    db.collection('timeEntries').get(),
    db.collection('employees').get(),
    db.collection('materialCredits').get()
  ])

  const projectsById = new Map()
  projectsSnap.forEach((d) => projectsById.set(d.id, d.data() || {}))
  const employeeName = (id) => {
    const doc = employeesSnap.docs.find((e) => e.id === id)
    const data = doc?.data() || {}
    return data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || id || '—'
  }

  // --- 1. Passende Projekte + Kunden ---------------------------------------
  const matchedProjects = projectsSnap.docs.filter((d) => {
    const p = d.data() || {}
    return hit(p.name) || hit(p.client) || hit(p.customerName) || hit(p.address)
  })
  const matchedCustomers = customersSnap.docs.filter((d) => {
    const c = d.data() || {}
    return hit(c.name) || hit(c.company) || hit(c.contactName)
  })

  console.log(`Projekt-Dokumente mit Treffer: ${matchedProjects.length}`)
  for (const d of matchedProjects) {
    const p = d.data() || {}
    console.log(
      `  • ${d.id}  "${p.name || '(ohne Name)'}"` +
        `  Kunde: ${p.client || p.customerName || '—'}` +
        `  Status: ${p.status || '—'}/isActive=${p.isActive}` +
        `  HERO: ${p.heroProjectId || '—'}`
    )
  }
  if (matchedProjects.length > 1) {
    console.log('  ⚠️  Mehr als ein Projektdokument — mögliche Dublette (manuell + HERO-Sync).')
  }

  console.log(`\nKunden-Dokumente mit Treffer: ${matchedCustomers.length}`)
  for (const d of matchedCustomers) {
    const c = d.data() || {}
    console.log(`  • ${d.id}  "${c.name || '(ohne Name)'}"  HERO: ${c.heroCustomerId || '—'}`)
  }

  const matchedProjectIds = new Set(matchedProjects.map((d) => d.id))
  const matchedCustomerIds = new Set(matchedCustomers.map((d) => d.id))

  // --- 2. Stempelsätze je Projektdokument ----------------------------------
  console.log('\n--- Stempelsätze je Projektdokument (so rechnet die Nachkalkulation) ---')
  for (const d of matchedProjects) {
    const rows = entriesSnap.docs
      .map((e) => ({ id: e.id, ...(e.data() || {}) }))
      .filter((e) => e.projectId === d.id)
      .sort((a, b) => (toDate(a.clockInTime)?.getTime() || 0) - (toDate(b.clockInTime)?.getTime() || 0))

    const hours = rows.reduce((sum, r) => sum + entryHours(r), 0)
    const material = rows.flatMap(materialLines)
    const credits = creditsSnap.docs.filter((c) => (c.data() || {}).projectId === d.id)

    console.log(`\n  Projekt ${d.id} "${(d.data() || {}).name}"`)
    console.log(`    Stempelsätze: ${rows.length}   Stunden: ${hours.toFixed(2)}`)
    console.log(`    Material an Stempelsätzen: ${material.length} Positionen`)
    console.log(`    Material-Buchungen (materialCredits): ${credits.length}`)
    for (const r of rows.slice(0, 20)) {
      const cin = toDate(r.clockInTime)
      console.log(
        `      ${fmtDate(cin)} ${fmtTime(cin)}–${fmtTime(toDate(r.clockOutTime))}` +
          `  ${employeeName(r.employeeId)}  (${r.id})`
      )
    }
    if (rows.length > 20) console.log(`      … und ${rows.length - 20} weitere`)
    if (rows.length === 0) {
      console.log('    ➜ Auf DIESEM Dokument liegt nichts. Die Buchungen hängen woanders (siehe unten).')
    }
  }

  // --- 3. Kleinaufträge auf den passenden Kunden ---------------------------
  const customerEntries = entriesSnap.docs
    .map((e) => ({ id: e.id, ...(e.data() || {}) }))
    .filter((e) => !e.projectId && e.customerId && matchedCustomerIds.has(e.customerId))

  console.log(`\n--- Kleinaufträge direkt auf dem Kunden (projectId leer): ${customerEntries.length} ---`)
  if (customerEntries.length > 0) {
    console.log('  ➜ URSACHE GEFUNDEN: Diese Sätze erscheinen in KEINER Projekt-Nachkalkulation.')
    console.log('    Im Mitarbeiter-Bericht stehen sie als „Kleinauftrag: <Kunde>".')
  }
  for (const r of customerEntries.slice(0, 30)) {
    const cin = toDate(r.clockInTime)
    console.log(
      `      ${fmtDate(cin)} ${fmtTime(cin)}–${fmtTime(toDate(r.clockOutTime))}` +
        `  ${employeeName(r.employeeId)}  Kunde: ${r.customerName || r.customerId}  (${r.id})` +
        `  Material: ${materialLines(r).length}`
    )
  }

  // --- 4. Verwaiste / projektlose Stempelsätze -----------------------------
  const orphans = entriesSnap.docs
    .map((e) => ({ id: e.id, ...(e.data() || {}) }))
    .filter((e) => {
      if (matchedProjectIds.has(e.projectId)) return false
      const noProject = !e.projectId
      const danglingProject = !!e.projectId && !projectsById.has(e.projectId)
      return noProject || danglingProject
    })

  const orphansNoCustomer = orphans.filter((e) => !e.customerId)
  const danglingByProjectId = new Map()
  for (const e of orphans) {
    if (e.projectId && !projectsById.has(e.projectId)) {
      danglingByProjectId.set(e.projectId, (danglingByProjectId.get(e.projectId) || 0) + 1)
    }
  }

  console.log('\n--- Stempelsätze ohne gültiges Projekt (gesamte Datenbank) ---')
  console.log(`  ohne projectId UND ohne customerId: ${orphansNoCustomer.length}`)
  console.log('    ➜ Diese stehen im Mitarbeiter-Bericht mit LEERER Projektspalte.')
  for (const r of orphansNoCustomer.slice(0, 30)) {
    const cin = toDate(r.clockInTime)
    console.log(
      `      ${fmtDate(cin)} ${fmtTime(cin)}–${fmtTime(toDate(r.clockOutTime))}` +
        `  ${employeeName(r.employeeId)}  (${r.id})  Notiz: ${(r.notes || '').slice(0, 60) || '—'}`
    )
  }

  console.log(`\n  projectId zeigt auf ein NICHT existierendes Projekt: ${danglingByProjectId.size} ID(s)`)
  for (const [pid, count] of danglingByProjectId) {
    console.log(`      ${pid}  →  ${count} Stempelsätze (Projektdokument fehlt/gelöscht)`)
  }

  // --- 5. Material-Buchungen mit passendem Text ---------------------------
  const looseCredits = creditsSnap.docs
    .map((c) => ({ id: c.id, ...(c.data() || {}) }))
    .filter((c) => !projectsById.has(c.projectId) || hit(c.materialName) || hit(c.note))
  if (looseCredits.length > 0) {
    console.log(`\n--- Auffällige Material-Buchungen: ${looseCredits.length} ---`)
    for (const c of looseCredits.slice(0, 20)) {
      console.log(
        `      ${fmtDate(toDate(c.createdAt))}  ${c.materialName || '—'}  ${c.quantity || 0} ${c.unitLabel || ''}` +
          `  projectId: ${c.projectId} ${projectsById.has(c.projectId) ? '' : '(Projekt fehlt!)'}`
      )
    }
  }

  console.log('\n=== Ende der Diagnose ===\n')
}

main().catch((error) => {
  console.error('Diagnose fehlgeschlagen:', error)
  process.exit(1)
})
