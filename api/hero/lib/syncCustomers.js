const { getFirestore } = require('firebase-admin/firestore')
const { fetchHeroProjectMatches } = require('./heroGraphql')
const { writeHeroSyncLog } = require('./syncLog')

function buildCustomerName(customer) {
  if (!customer) return ''
  if (customer.company_name) return String(customer.company_name).trim()
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
}

async function loadCustomersByHeroId(db) {
  const snapshot = await db.collection('customers').get()
  const map = new Map()
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    if (data.heroCustomerId != null && data.heroCustomerId !== '') {
      map.set(String(data.heroCustomerId), { id: docSnap.id, data })
    }
  })
  return map
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

/**
 * Synchronisiert Kunden aus HERO. Quelle ist die bereits bewährte
 * `project_matches`-Query (jeder Treffer enthält den Kunden eingebettet), daher
 * werden keine unbestätigten zusätzlichen Queries benötigt. Verknüpft die
 * importierten Projekte gleichzeitig mit ihrem Kunden.
 */
async function syncHeroCustomersToFirestore() {
  const db = getFirestore()
  const heroProjects = await fetchHeroProjectMatches()
  const existingByHeroId = await loadCustomersByHeroId(db)

  const stats = { created: 0, updated: 0, skipped: 0, total: 0 }
  const now = new Date()

  // Distinkte Kunden aus den Projekt-Treffern sammeln
  const distinctCustomers = new Map()
  for (const heroProject of heroProjects) {
    const customer = heroProject?.customer
    const customerId = customer?.id != null ? String(customer.id) : ''
    if (!customerId) continue
    if (!distinctCustomers.has(customerId)) {
      distinctCustomers.set(customerId, customer)
    }
  }

  stats.total = distinctCustomers.size
  const docIdByHeroCustomerId = new Map()

  for (const [customerId, customer] of distinctCustomers) {
    const name = buildCustomerName(customer)
    const payload = {
      name: name || `HERO Kunde ${customerId}`,
      companyName: customer.company_name ? String(customer.company_name).trim() : undefined,
      firstName: customer.first_name || undefined,
      lastName: customer.last_name || undefined,
      email: customer.email || undefined,
      source: 'hero',
      heroCustomerId: customerId,
      heroLastSyncedAt: now,
      isActive: true
    }
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )

    const existing = existingByHeroId.get(customerId)
    if (existing) {
      await db.collection('customers').doc(existing.id).set(cleaned, { merge: true })
      docIdByHeroCustomerId.set(customerId, existing.id)
      stats.updated += 1
    } else {
      const ref = await db.collection('customers').add({ ...cleaned, createdAt: now })
      docIdByHeroCustomerId.set(customerId, ref.id)
      stats.created += 1
    }
  }

  // Projekte mit ihrem Kunden verknüpfen
  const projectsByHeroId = await loadProjectsByHeroId(db)
  for (const heroProject of heroProjects) {
    const heroProjectId = heroProject?.id != null ? String(heroProject.id) : ''
    const customerId = heroProject?.customer?.id != null ? String(heroProject.customer.id) : ''
    if (!heroProjectId || !customerId) continue

    const project = projectsByHeroId.get(heroProjectId)
    const customerDocId = docIdByHeroCustomerId.get(customerId)
    if (project && customerDocId) {
      await db.collection('projects').doc(project.id).set(
        {
          customerId: customerDocId,
          customerName: buildCustomerName(heroProject.customer) || `HERO Kunde ${customerId}`
        },
        { merge: true }
      )
    }
  }

  await writeHeroSyncLog({
    type: 'customers',
    success: true,
    message: `Kunden-Sync abgeschlossen (${stats.created} neu, ${stats.updated} aktualisiert).`,
    stats
  })

  return stats
}

module.exports = { syncHeroCustomersToFirestore }
