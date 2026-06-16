const { getHeroApiKey, getHeroGraphqlUrl } = require('./heroConfig')

async function heroGraphqlRequest(query, variables = {}) {
  const apiKey = getHeroApiKey()
  const url = getHeroGraphqlUrl()

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables })
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.message ||
      `HERO GraphQL HTTP ${response.status}`
    const error = new Error(message)
    error.statusCode = response.status
    error.payload = payload
    throw error
  }

  if (payload?.errors?.length) {
    const message = payload.errors.map((e) => e.message).join('; ')
    const error = new Error(message)
    error.payload = payload
    throw error
  }

  return payload?.data || {}
}

const PROJECT_MATCHES_QUERY = `
  query HeroProjectMatches {
    project_matches {
      id
      project_nr
      measure {
        short
        name
      }
      customer {
        id
        first_name
        last_name
        company_name
        email
      }
      contact {
        id
        first_name
        last_name
      }
      address {
        street
        city
        zipcode
      }
      current_project_match_status {
        status_code
        name
      }
    }
  }
`

async function fetchHeroProjectMatches() {
  const data = await heroGraphqlRequest(PROJECT_MATCHES_QUERY)
  return Array.isArray(data.project_matches) ? data.project_matches : []
}

const SUPPLY_PRODUCTS_QUERY = `
  query HeroSupplyProducts($first: Int, $offset: Int) {
    supply_product_versions(first: $first, offset: $offset) {
      product_id
      nr
      base_price
      list_price
      vat_percent
      price_quantity
      is_deleted
      base_data {
        name
        unit_type
        description
        matchcode
        category
      }
      sales_prices {
        net_price_per_unit
        label
      }
    }
  }
`

/**
 * Lädt HERO-Artikel (Verbrauchsprodukte) seitenweise. Begrenzt durch maxItems,
 * damit ein sehr großer Katalog die Materialliste nicht sprengt.
 */
async function fetchHeroSupplyProducts({ pageSize = 200, maxItems = 5000 } = {}) {
  const all = []
  let offset = 0
  for (let page = 0; page < 100; page += 1) {
    const data = await heroGraphqlRequest(SUPPLY_PRODUCTS_QUERY, { first: pageSize, offset })
    const batch = Array.isArray(data.supply_product_versions) ? data.supply_product_versions : []
    all.push(...batch)
    if (batch.length < pageSize || all.length >= maxItems) break
    offset += pageSize
  }
  return all.slice(0, maxItems)
}

const CUSTOMER_DOCUMENTS_QUERY = `
  query HeroCustomerDocuments($pmid: [Int], $first: Int) {
    customer_documents(project_match_ids: $pmid, first: $first) {
      id
      nr
      date
      type
      status_code
      status_name
      value
      document_type_id
      document_type {
        id
        name
        base_type
      }
      metadata {
        positions {
          type
          name
          net_value
          vat
          nr
          cost_center_number
        }
      }
      published_customer_document_draft {
        data
      }
    }
  }
`

/** Lädt die Kundendokumente (Angebote/Rechnungen/…) zu einem HERO project_match. */
async function fetchCustomerDocumentsForProjectMatch(projectMatchId, { first = 50 } = {}) {
  const pmid = Number(projectMatchId)
  if (!Number.isFinite(pmid)) return []
  const data = await heroGraphqlRequest(CUSTOMER_DOCUMENTS_QUERY, { pmid: [pmid], first })
  return Array.isArray(data.customer_documents) ? data.customer_documents : []
}

const CONTACTS_QUERY = `
  query HeroContacts($first: Int, $offset: Int) {
    contacts(first: $first, offset: $offset) {
      id
      first_name
      last_name
      company_name
      full_name
      email
      phone_mobile
      phone_home
      nr
      is_deleted
      is_contact_person
      address {
        street
        city
        zipcode
      }
    }
  }
`

/** Lädt alle HERO-Kontakte/Kunden seitenweise (auch ohne Projekt). */
async function fetchHeroContacts({ pageSize = 200, maxItems = 10000 } = {}) {
  const all = []
  let offset = 0
  for (let page = 0; page < 200; page += 1) {
    const data = await heroGraphqlRequest(CONTACTS_QUERY, { first: pageSize, offset })
    const batch = Array.isArray(data.contacts) ? data.contacts : []
    all.push(...batch)
    if (batch.length < pageSize || all.length >= maxItems) break
    offset += pageSize
  }
  return all.slice(0, maxItems)
}

module.exports = {
  heroGraphqlRequest,
  fetchHeroProjectMatches,
  fetchHeroSupplyProducts,
  fetchCustomerDocumentsForProjectMatch,
  fetchHeroContacts,
  PROJECT_MATCHES_QUERY,
  SUPPLY_PRODUCTS_QUERY,
  CUSTOMER_DOCUMENTS_QUERY,
  CONTACTS_QUERY
}
