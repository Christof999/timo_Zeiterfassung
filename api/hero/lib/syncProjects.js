const { getFirestore } = require('firebase-admin/firestore')
const { fetchHeroProjectMatches } = require('./heroGraphql')
const { updateHeroIntegrationConfig, writeHeroSyncLog } = require('./syncLog')

function formatHeroAddress(address) {
  if (!address) return ''
  const parts = [address.street, [address.zipcode, address.city].filter(Boolean).join(' ')].filter(Boolean)
  return parts.join(', ').trim()
}

function formatHeroClient(customer) {
  if (!customer) return ''
  if (customer.company_name) return String(customer.company_name).trim()
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
}

function buildProjectName(heroProject) {
  const nr = heroProject.project_nr ? String(heroProject.project_nr).trim() : ''
  const client = formatHeroClient(heroProject.customer)
  if (nr && client) return `${nr} – ${client}`
  if (nr) return nr
  if (client) return client
  return `HERO Projekt ${heroProject.id}`
}

function mapHeroProjectStatus(statusCode, statusName) {
  const name = String(statusName || '').toLowerCase()
  const archivedHints = ['abgeschloss', 'archiv', 'storniert', 'abgebrochen', 'verloren', 'abgelehnt']
  if (archivedHints.some((hint) => name.includes(hint))) {
    return { status: 'archived', isActive: false }
  }
  return { status: 'active', isActive: true, heroStatusCode: statusCode, heroStatusName: statusName }
}

async function loadProjectsByHeroId(db) {
  const snapshot = await db.collection('projects').get()
  const map = new Map()
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    if (data.heroProjectId != null && data.heroProjectId !== '') {
      map.set(String(data.heroProjectId), { id: docSnap.id, data })
    }
  })
  return map
}

async function syncHeroProjectsToFirestore() {
  const db = getFirestore()
  const heroProjects = await fetchHeroProjectMatches()
  const existingByHeroId = await loadProjectsByHeroId(db)

  const stats = {
    created: 0,
    updated: 0,
    archived: 0,
    skipped: 0,
    total: heroProjects.length
  }

  const now = new Date()

  for (const heroProject of heroProjects) {
    const heroId = heroProject?.id != null ? String(heroProject.id) : ''
    if (!heroId) {
      stats.skipped += 1
      continue
    }

    const statusInfo = heroProject.current_project_match_status || {}
    const mappedStatus = mapHeroProjectStatus(statusInfo.status_code, statusInfo.name)
    const address = formatHeroAddress(heroProject.address)
    const payload = {
      name: buildProjectName(heroProject),
      client: formatHeroClient(heroProject.customer),
      location: address,
      address,
      description: heroProject.measure?.name
        ? `Gewerk: ${heroProject.measure.name}`
        : heroProject.measure?.short
          ? `Gewerk: ${heroProject.measure.short}`
          : undefined,
      heroProjectId: heroId,
      heroProjectNr: heroProject.project_nr != null ? String(heroProject.project_nr) : null,
      heroLastSyncedAt: now,
      heroSyncSource: 'hero',
      heroStatusCode: statusInfo.status_code ?? null,
      heroStatusName: statusInfo.name ?? null,
      status: mappedStatus.status,
      isActive: mappedStatus.isActive
    }

    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )

    const existing = existingByHeroId.get(heroId)
    if (existing) {
      await db.collection('projects').doc(existing.id).set(cleaned, { merge: true })
      stats.updated += 1
      if (mappedStatus.status === 'archived') {
        stats.archived += 1
      }
    } else {
      const ref = await db.collection('projects').add({
        ...cleaned,
        createdAt: now
      })
      existingByHeroId.set(heroId, { id: ref.id, data: cleaned })
      stats.created += 1
    }
  }

  await updateHeroIntegrationConfig({
    lastProjectSyncAt: now,
    lastProjectSyncError: null,
    lastProjectSyncStats: stats
  })

  await writeHeroSyncLog({
    type: 'projects',
    success: true,
    message: `Projekt-Sync abgeschlossen (${stats.created} neu, ${stats.updated} aktualisiert).`,
    stats
  })

  return stats
}

module.exports = { syncHeroProjectsToFirestore }
