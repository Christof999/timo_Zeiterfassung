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

/**
 * Sucht im (beliebig verschachtelten) JSON-Entwurf nach echten Positionszeilen,
 * d. h. Objekten mit einem Mengen-/Anzahl-Feld. Liefert Beispiel-Zeilen, damit
 * Feldnamen für Menge/Einheit/Artikel/Typ erkennbar werden.
 */
function findProductRowSamples(root, maxSamples = 5) {
  const qtyRe = /^(amount|quantity|menge|qty|anzahl|count|stk|pieces)$/i
  const samples = []
  const typeCounts = {}

  const walk = (node, depth) => {
    if (node == null || depth > 8 || samples.length >= maxSamples) return
    if (Array.isArray(node)) {
      for (const el of node) walk(el, depth + 1)
      return
    }
    if (typeof node === 'object') {
      const keys = Object.keys(node)
      if (typeof node.type === 'string') {
        typeCounts[node.type] = (typeCounts[node.type] || 0) + 1
      }
      const hasQty = keys.some((k) => qtyRe.test(k))
      const looksLikeRow =
        hasQty &&
        keys.some((k) => /price|net|value|title|name|unit|einheit|product|article|artikel/i.test(k))
      if (looksLikeRow) {
        samples.push({ keys, json: JSON.stringify(node).slice(0, 1800) })
      }
      for (const k of keys) walk(node[k], depth + 1)
    }
  }

  walk(root, 0)
  return { typeCounts, samples }
}

/** Analysiert den unstrukturierten JSON-Entwurf (Mixed) auf eine Positionsliste. */
function analyzeDraftData(data) {
  if (data == null) return null
  if (typeof data !== 'object') return { kind: typeof data }

  const scan = findProductRowSamples(data)

  if (Array.isArray(data)) {
    const first = data[0]
    return {
      kind: 'array',
      length: data.length,
      firstItemKeys: first && typeof first === 'object' ? Object.keys(first) : null,
      itemTypeCounts: scan.typeCounts,
      productRowSamples: scan.samples
    }
  }

  const keys = Object.keys(data)
  const arrayKeys = keys.filter((k) => Array.isArray(data[k]))
  const positionsKey =
    keys.find((k) => /position|item|line|zeile|artikel/i.test(k) && Array.isArray(data[k])) ||
    arrayKeys[0] ||
    null
  const posArr = positionsKey ? data[positionsKey] : null
  return {
    kind: 'object',
    keys,
    arrayKeys,
    positionsKey,
    positionsCount: Array.isArray(posArr) ? posArr.length : null,
    itemTypeCounts: scan.typeCounts,
    productRowSamples: scan.samples
  }
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

// Einheiten, die als Lohn/Arbeitszeit gelten (nicht für Mitarbeiter sichtbar)
const LABOR_UNIT_RE = /^(std|std\.|stunde|stunden|h|hour|akh|aw)$/i

/** Sammelt rekursiv alle Produkt-Positionen aus dem JSON-Entwurf (auch verschachtelt). */
function collectDraftProductItems(root) {
  const out = []
  const seen = new Set()
  const walk = (node, depth) => {
    if (node == null || depth > 10) return
    if (Array.isArray(node)) {
      for (const el of node) walk(el, depth + 1)
      return
    }
    if (typeof node === 'object') {
      if (node.type === 'product' && (node.name || node.nr)) {
        const id = node.uid || node.hash || `${node.nr}|${node.name}|${node.quantity}`
        if (!seen.has(id)) {
          seen.add(id)
          out.push(node)
        }
      }
      for (const k of Object.keys(node)) walk(node[k], depth + 1)
    }
  }
  walk(root, 0)
  return out
}

function offerPositionFromDraftItem(item) {
  const name = (item.name || '').trim()
  if (!name) return null
  const unit = (item.unit_type || '').trim()
  const quantity = Number(item.quantity)
  const unitPrice = typeof item.net_price_per_unit === 'number' ? item.net_price_per_unit : undefined
  return {
    nr: item.nr != null ? String(item.nr) : '',
    name,
    unit,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPriceEur: typeof unitPrice === 'number' ? Math.round(unitPrice * 100) / 100 : undefined,
    vatPercent: typeof item.vat_percent === 'number' ? item.vat_percent : undefined,
    kind: LABOR_UNIT_RE.test(unit) ? 'labor' : 'material'
  }
}

/**
 * Importiert das aktuellste Angebot eines Projekts: extrahiert die Positionen
 * (Material + Lohn, mit Soll-Menge) aus dem JSON-Entwurf und speichert sie am
 * Projekt (gefunden über heroProjectId == project_match_id).
 */
async function syncProjectOfferToFirestore(projectMatchId) {
  const db = getFirestore()
  const docs = await fetchCustomerDocumentsForProjectMatch(projectMatchId, { first: 50 })
  const offers = docs.filter((d) => (d.document_type?.base_type || d.type) === 'offer')
  const sorted = offers.sort((a, b) => getDateValue(b.date) - getDateValue(a.date))
  const latest = sorted[0]

  if (!latest) {
    return { found: false, message: 'Kein Angebot für dieses Projekt gefunden.' }
  }

  const productItems = collectDraftProductItems(latest.published_customer_document_draft?.data)
  const rawPositions = productItems
    .map(offerPositionFromDraftItem)
    .filter((p) => p != null)

  // Duplikate (gleicher Artikel mehrfach im Angebot) zu einer Position mit
  // summierter Soll-Menge zusammenfassen.
  const mergedMap = new Map()
  for (const p of rawPositions) {
    const key =
      p.nr && String(p.nr).trim()
        ? `nr:${String(p.nr).trim()}`
        : `nm:${p.name.toLowerCase()}|${(p.unit || '').toLowerCase()}`
    const existing = mergedMap.get(key)
    if (existing) {
      existing.quantity = (existing.quantity || 0) + (p.quantity || 0)
    } else {
      mergedMap.set(key, { ...p })
    }
  }
  const positions = [...mergedMap.values()].map((p) => ({
    ...p,
    quantity: Math.round((p.quantity || 0) * 1000) / 1000
  }))

  const snap = await db
    .collection('projects')
    .where('heroProjectId', '==', String(projectMatchId))
    .limit(1)
    .get()
  if (snap.empty) {
    throw new Error('Kein Projekt mit dieser HERO-ID gefunden (bitte zuerst Projekte synchronisieren).')
  }

  const materialCount = positions.filter((p) => p.kind === 'material').length
  const offerMeta = {
    nr: latest.nr || null,
    date: latest.date || null,
    value: latest.value ?? null,
    positionCount: positions.length,
    materialCount,
    importedAt: new Date()
  }

  await snap.docs[0].ref.set({ offerPositions: positions, offerMeta }, { merge: true })

  return {
    found: true,
    offerNr: latest.nr || null,
    positionCount: positions.length,
    materialCount,
    laborCount: positions.length - materialCount
  }
}

module.exports = {
  syncHeroProjectsToFirestore,
  syncHeroMaterialsToFirestore,
  probeProjectOffers,
  syncProjectOfferToFirestore
}
