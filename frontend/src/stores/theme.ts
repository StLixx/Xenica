import { create } from 'zustand'
import type { ThemeName, ThemeMode } from '../lib/types'
import { getStoredTheme, applyTheme } from '../lib/theme'

interface ThemeStore {
  theme: ThemeName
  mode: ThemeMode
  setTheme: (theme: ThemeName) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
  cycleTheme: () => void
}

const stored = getStoredTheme()

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: stored.theme,
  mode: stored.mode,

  setTheme: (theme) => {
    const { mode } = get()
    applyTheme(theme, mode)
    set({ theme })
  },

  setMode: (mode) => {
    const { theme } = get()
    applyTheme(theme, mode)
    set({ mode })
  },

  toggleMode: () => {
    const { theme, mode } = get()
    const newMode = mode === 'dark' ? 'light' : 'dark'
    applyTheme(theme, newMode)
    set({ mode: newMode })
  },

  cycleTheme: () => {
    const { theme, mode } = get()
    const themes: ThemeName[] = ['amber', 'indigo', 'olive']
    const idx = themes.indexOf(theme)
    const next = themes[(idx + 1) % themes.length]
    applyTheme(next, mode)
    set({ theme: next })
  },
}))
