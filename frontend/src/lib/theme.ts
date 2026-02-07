import type { ThemeName, ThemeMode } from './types'

const STORAGE_KEY = 'xenica-theme'

export function getStoredTheme(): { theme: ThemeName; mode: ThemeMode } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        theme: parsed.theme || 'amber',
        mode: parsed.mode || 'dark',
      }
    }
  } catch {}
  return { theme: 'amber', mode: 'dark' }
}

export function applyTheme(theme: ThemeName, mode: ThemeMode) {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
  html.setAttribute('data-mode', mode)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, mode }))
}

export const themeLabels: Record<ThemeName, string> = {
  amber: '琥珀暖光',
  indigo: '靛蓝墨水',
  olive: '橄榄森林',
}

export const modeLabels: Record<ThemeMode, string> = {
  dark: '深色',
  light: '浅色',
}
