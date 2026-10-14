import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark' | 'auto'

type ResolvedTheme = 'light' | 'dark'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto'
}

/** The stored setting already applied by the inline script in `__root.tsx`. */
function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem('theme')
    return isThemeMode(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

function resolveThemeMode(mode: ThemeMode): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  return mode
}

function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveThemeMode(mode)

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = mode
  }

  document.documentElement.style.colorScheme = resolved
  return resolved
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--nav-icon)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="var(--nav-icon)"
      aria-hidden="true"
    >
      <path d="M12 3c.132 0 .263.003.393.009a7.5 7.5 0 0 0 7.2 9.873 7.5 7.5 0 0 1-7.593 11.109A9 9 0 1 1 12 3z" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--nav-icon)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  )
}

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'auto',
  auto: 'light',
}

const MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Világos téma aktív. Kattints a sötét témára váltáshoz.',
  dark: 'Sötét téma aktív. Kattints a rendszer témájára váltáshoz.',
  auto: 'Rendszer téma aktív. Kattints a világos témára váltáshoz.',
}

export default function ThemeToggle() {
  // SSR always renders the system default; the real mode is picked up after
  // hydration so that server and client output match.
  const [mode, setMode] = useState<ThemeMode>('auto')

  useEffect(() => {
    const stored = readStoredMode()
    setMode(stored)
    applyThemeMode(stored)
  }, [])

  useEffect(() => {
    if (mode !== 'auto') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeMode('auto')

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [mode])

  function toggleMode() {
    // Cycles light → dark → system default → light.
    const nextMode = NEXT_MODE[mode]

    setMode(nextMode)
    applyThemeMode(nextMode)
    window.localStorage.setItem('theme', nextMode)
  }

  const label = MODE_LABELS[mode]

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="icon-btn gap-2 px-3 py-1.5 text-sm font-semibold"
    >
      {mode === 'auto' ? (
        <MonitorIcon />
      ) : mode === 'dark' ? (
        <MoonIcon />
      ) : (
        <SunIcon />
      )}
    </button>
  )
}
