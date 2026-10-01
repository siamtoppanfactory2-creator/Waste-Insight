import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/** Theme currently applied to <html> (index.html sets it before first paint). */
function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function saveTheme(theme: Theme) {
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* storage blocked — theme still applies for this visit */ }
}

/**
 * Light / dark theme toggle.
 * First visit follows the OS setting; once the user picks one it is remembered per browser.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
