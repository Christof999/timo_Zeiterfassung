const { getFirestore } = require('firebase-admin/firestore')
const {
  fetchHeroProjectMatches,
  fetchHeroSupplyProducts,
  fetchCustomerDocumentsForProjectMatch
} = require('./heroGraphql')
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

/**
 * Legt/aktualisiert einen Kunden in Firestore an und liefert dessen Doc-ID.
 * Kunden werden aus den eingebetteten HERO-Kundendaten der project_matches
 * abgeleitet (keine zusätzliche, unbestätigte HERO-Query nötig).
 */
async function upsertHeroCustomer(db, customer, ctx) {
  const customerId = customer?.id != null ? String(customer.id) : ''
  if (!customerId) return null

  // Pro Sync nur einmal je Kunde schreiben
  if (ctx.docIdByHeroCustomerId.has(customerId)) {
    return ctx.docIdByHeroCustomerId.get(customerId)
  }

  const name = formatHeroClient(customer)
  const payload = {
    name: name || `HERO Kunde ${customerId}`,
    companyName: customer.company_name ? String(customer.company_name).trim() : undefined,
    firstName: customer.first_name || undefined,
    lastName: customer.last_name || undefined,
    email: customer.email || undefined,
    source: 'hero',
    heroCustomerId: customerId,
    heroLastSyncedAt: ctx.now,
    isActive: true
  }
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  )

  const existing = ctx.existingCustomersByHeroId.get(customerId)
  let docId
  if (existing) {
    await db.collection('customers').doc(existing.id).set(cleaned, { merge: true })
    docId = existing.id
    ctx.customerStats.updated += 1
  } else {
    const ref = await db.collection('customers').add({ ...cleaned, createdAt: ctx.now })
    docId = ref.id
    ctx.customerStats.created += 1
  }

  ctx.docIdByHeroCustomerId.set(customerId, docId)
  return docId
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

  // Kontext für den eingebetteten Kunden-Sync
  const customerCtx = {
    now,
    existingCustomersByHeroId: await loadCustomersByHeroId(db),
    docIdByHeroCustomerId: new Map(),
    customerStats: { created: 0, updated: 0, total: 0 }
  }

  for (const heroProject of heroProjects) {
    const heroId = heroProject?.id != null ? String(heroProject.id) : ''
    if (!heroId) {
      stats.skipped += 1
      continue
    }

    // Kunde zuerst anlegen/aktualisieren, damit wir die Verknüpfung setzen können
    const customerDocId = await upsertHeroCustomer(db, heroProject.customer, customerCtx)

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
      customerId: customerDocId || undefined,
      customerName: customerDocId
        ? formatHeroClient(heroProject.customer) || `HERO Kunde ${heroProject.customer.id}`
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

  customerCtx.customerStats.total = customerCtx.docIdByHeroCustomerId.size
  const customerStats = customerCtx.customerStats

  await updateHeroIntegrationConfig({
    lastProjectSyncAt: now,
    lastProjectSyncError: null,
    lastProjectSyncStats: stats
  })

  await writeHeroSyncLog({
    type: 'projects',
    success: true,
    message:
      `Projekt-Sync abgeschlossen (${stats.created} neu, ${stats.updated} aktualisiert; ` +
      `Kunden: ${customerStats.created} neu, ${customerStats.updated} aktualisiert).`,
    stats
  })

  return { stats, customerStats }
}

// ==================== ARTIKEL → MATERIALLISTE ====================

function pickSalesPrice(salesPrices) {
  if (Array.isArray(salesPrices)) {
    const first = salesPrices.find((s) => s && typeof s.net_price_per_unit === 'number')
    return first || salesPrices[0] || null
  }
  return salesPrices || null
}

function buildMaterialFromProduct(product) {
  const productId = product?.product_id != null ? String(product.product_id) : ''
  if (!productId) return null

  const base = product.base_data || {}
  const name = (base.name && String(base.name).trim()) || (product.nr && String(product.nr).trim())
  if (!name) return null

  const salesPrice = pickSalesPrice(product.sales_prices)
  const price =
    (salesPrice && typeof salesPrice.net_price_per_unit === 'number'
      ? salesPrice.net_price_per_unit
      : undefined) ??
    (typeof product.list_price === 'number' ? product.list_price : undefined) ??
    (typeof product.base_price === 'number' ? product.base_price : undefined)

  return {
    heroArticleId: productId,
    name,
    unitLabel: (base.unit_type && String(base.unit_type).trim()) || 'Stück',
    unitPriceEur: typeof price === 'number' ? Math.round(price * 100) / 100 : undefined
  }
}

async function loadMaterialsByHeroArticleId(db) {
  const snapshot = await db.collection('materialTypes').get()
  const map = new Map()
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    if (data.heroArticleId != null && data.heroArticleId !== '') {
      map.set(String(data.heroArticleId), { id: docSnap.id, data })
    }
  })
  return map
}

async function syncHeroMaterialsToFirestore() {
  const db = getFirestore()
  const products = await fetchHeroSupplyProducts()
  const existingByHeroId = await loadMaterialsByHeroArticleId(db)

  const stats = { created: 0, updated: 0, skipped: 0, total: products.length }
  const now = new Date()

  for (const product of products) {
    if (product?.is_deleted === true) {
      stats.skipped += 1
      continue
    }
    const mapped = buildMaterialFromProduct(product)
    if (!mapped) {
      stats.skipped += 1
      continue
    }

    const payload = {
      name: mapped.name,
      unitLabel: mapped.unitLabel,
      unitPriceEur: mapped.unitPriceEur,
      source: 'hero',
      heroArticleId: mapped.heroArticleId,
      heroLastSyncedAt: now
    }
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )

    const existing = existingByHeroId.get(mapped.heroArticleId)
    if (existing) {
      await db.collection('materialTypes').doc(existing.id).set(cleaned, { merge: true })
      stats.updated += 1
    } else {
      await db.collection('materialTypes').add({
        ...cleaned,
        isActive: true,
        sortOrder: 100,
        createdAt: now
      })
      stats.created += 1
    }
  }

  await writeHeroSyncLog({
    type: 'materials',
    success: true,
    message: `Artikel-Import abgeschlossen (${stats.created} neu, ${stats.updated} aktualisiert).`,
    stats
  })

  return stats
}

// ==================== ANGEBOTS-PROBE ====================

function getDateValue(value) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Analysiert den unstrukturierten JSON-Entwurf (Mixed) auf eine Positionsliste. */
function analyzeDraftData(data) {
  if (data == null) return null
  if (Array.isArray(data)) {
    const first = data[0]
    return {
      kind: 'array',
      length: data.length,
      firstItemKeys: first && typeof first === 'object' ? Object.keys(first) : null,
      sampleJson: JSON.stringify(first ?? null).slice(0, 4000)
    }
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data)
    const arrayKeys = keys.filter((k) => Array.isArray(data[k]))
    const positionsKey =
      keys.find((k) => /position|item|line|zeile|artikel/i.test(k) && Array.isArray(data[k])) ||
      arrayKeys[0] ||
      null
    const posArr = positionsKey ? data[positionsKey] : null
    const firstPos = Array.isArray(posArr) ? posArr[0] : null
    return {
      kind: 'object',
      keys,
      arrayKeys,
      positionsKey,
      positionsCount: Array.isArray(posArr) ? posArr.length : null,
      positionFirstKeys: firstPos && typeof firstPos === 'object' ? Object.keys(firstPos) : null,
      positionSampleJson: firstPos != null ? JSON.stringify(firstPos).slice(0, 4000) : null
    }
  }
  return { kind: typeof data }
}

/**
 * Liest die Kundendokumente eines Projekts aus und liefert eine bereinigte
 * Struktur-Probe (Positions-Typen, Werte, JSON-Entwurf-Analyse), damit der
 * Angebots-Import gezielt gebaut werden kann.
 */
async function probeProjectOffers(projectMatchId) {
  const docs = await fetchCustomerDocumentsForProjectMatch(projectMatchId, { first: 50 })
  const sorted = [...docs].sort((a, b) => getDateValue(b.date) - getDateValue(a.date))

  const documents = sorted.map((d) => ({
    id: d.id,
    nr: d.nr,
    date: d.date,
    type: d.type,
    documentType: d.document_type?.name || null,
    baseType: d.document_type?.base_type || null,
    statusName: d.status_name || null,
    value: d.value ?? null,
    positionsCount: Array.isArray(d.metadata?.positions) ? d.metadata.positions.length : 0,
    hasDraftData: d.published_customer_document_draft?.data != null
  }))

  const latestWithPositions = sorted.find(
    (d) => Array.isArray(d.metadata?.positions) && d.metadata.positions.length > 0
  )

  let sample = null
  if (latestWithPositions) {
    const positions = latestWithPositions.metadata.positions
    sample = {
      id: latestWithPositions.id,
      nr: latestWithPositions.nr,
      date: latestWithPositions.date,
      documentType: latestWithPositions.document_type?.name || null,
      baseType: latestWithPositions.document_type?.base_type || null,
      positionTypes: [...new Set(positions.map((p) => p.type).filter((t) => t != null))],
      positions: positions.slice(0, 60).map((p) => ({
        type: p.type,
        name: p.name,
        net_value: p.net_value,
        vat: p.vat,
        nr: p.nr,
        cost_center_number: p.cost_center_number
      })),
      draftData: analyzeDraftData(latestWithPositions.published_customer_document_draft?.data)
    }
  }

  return {
    projectMatchId: Number(projectMatchId),
    documentCount: documents.length,
    documents,
    sample
  }
}

module.exports = {
  syncHeroProjectsToFirestore,
  syncHeroMaterialsToFirestore,
  probeProjectOffers
}
