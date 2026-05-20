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
}

export const heroService = {
  async checkHealth(): Promise<HeroHealthResponse> {
    return heroApiFetch<HeroHealthResponse>('/api/hero/health', { method: 'GET' })
  },

  async syncProjects(): Promise<HeroProjectSyncResponse> {
    return heroApiFetch<HeroProjectSyncResponse>('/api/hero/sync/projects', {
      method: 'POST'
    })
  },

  getIntegrationConfig(): Promise<HeroIntegrationConfig | null> {
    return DataService.getHeroIntegrationConfig()
  },

  getRecentSyncLogs(limit = 10): Promise<HeroSyncLogEntry[]> {
    return DataService.getHeroSyncLogs(limit)
  }
}
