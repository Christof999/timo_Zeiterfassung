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

module.exports = {
  heroGraphqlRequest,
  fetchHeroProjectMatches,
  PROJECT_MATCHES_QUERY
}
