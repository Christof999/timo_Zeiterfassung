const STORAGE_KEY = 'lauffer-theme'

export type ThemeChoice = 'light' | 'dark'

export function getStoredTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: ThemeChoice): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function initThemeFromStorage(): ThemeChoice {
  const t = getStoredTheme()
  applyTheme(t)
  return t
}

export function toggleTheme(): ThemeChoice {
  const next: ThemeChoice = getStoredTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
