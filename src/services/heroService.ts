import { auth } from './firebaseConfig'
import type { HeroIntegrationConfig, HeroSyncLogEntry } from '../types'
import { DataService } from './dataService'

async function getAuthBearerToken(): Promise<string> {
  await DataService.authReady
  const user = auth.currentUser
  if (!user) {
    throw new Error('Kein Firebase Auth User vorhanden. Bitte Seite neu laden.')
  }
  return user.getIdToken()
}

async function heroApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthBearerToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {})
    }
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      (payload as { error?: string })?.error ||
      `HERO API Fehler (HTTP ${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export interface HeroHealthResponse {
  success: boolean
  syncEnabled: boolean
  hasApiKey: boolean
  graphqlUrl: string
  apiReachable: boolean
  apiError: string | null
}

export interface HeroProjectSyncResponse {
  success: boolean
  stats?: {
    created: number
    updated: number
    archived: number
    skipped: number
    total: number
  }
  customerStats?: {
    created: number
    updated: number
    total: number
  }
}

export interface HeroCustomerSyncResponse {
  success: boolean
  stats?: {
    created: number
    updated: number
    total: number
  }
}

export interface HeroDiagnosticsResponse {
  success: boolean
  syncEnabled: boolean
  hasApiKey: boolean
  graphqlUrl: string
  reachable: boolean
  error: string | null
  keyInfo: {
    rawLength: number
    trimmedLength: number
    preview: string
    hadSurroundingWhitespace: boolean
    hasSurroundingQuotes: boolean
    containsInnerWhitespace: boolean
    startsWithBearer: boolean
    looksLikeJwt: boolean
  } | null
  authProbe: Array<{
    scheme: string
    status: number
    ok: boolean
    error: string | null
  }> | null
  availableQueries: { relevant: string[]; total: number; error?: string }
  projects: {
    count: number
    sampleShape: unknown
    fieldCheck: Array<{
      path: string
      severity: 'required' | 'recommended' | 'optional'
      missing: number
      total: number
    }>
  } | null
}

export const heroService = {
  async checkHealth(): Promise<HeroHealthResponse> {
    return heroApiFetch<HeroHealthResponse>('/api/hero/health', { method: 'GET' })
  },

  // Firebase-freier Diagnose-Endpunkt – braucht nur HERO_API_KEY in Vercel.
  async runDiagnostics(): Promise<HeroDiagnosticsResponse> {
    const response = await fetch('/api/hero/diagnostics', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message =
        (payload as { error?: string })?.error ||
        `HERO Diagnose Fehler (HTTP ${response.status})`
      throw new Error(message)
    }
    return payload as HeroDiagnosticsResponse
  },

  async syncProjects(): Promise<HeroProjectSyncResponse> {
    return heroApiFetch<HeroProjectSyncResponse>('/api/hero/sync/projects', {
      method: 'POST'
    })
  },

  // Kunden werden im selben Lauf wie die Projekte synchronisiert (spart einen
  // Serverless-Function-Slot auf dem Hobby-Plan).
  async syncCustomers(): Promise<HeroCustomerSyncResponse> {
    const response = await heroApiFetch<HeroProjectSyncResponse>('/api/hero/sync/projects', {
      method: 'POST'
    })
    return { success: response.success, stats: response.customerStats }
  },

  getIntegrationConfig(): Promise<HeroIntegrationConfig | null> {
    return DataService.getHeroIntegrationConfig()
  },

  getRecentSyncLogs(limit = 10): Promise<HeroSyncLogEntry[]> {
    return DataService.getHeroSyncLogs(limit)
  }
}
