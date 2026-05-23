'use client';

/**
 * Custom theme context that replaces next-themes.
 *
 * next-themes injects a bare <script> React element to prevent FOUC, which
 * React 19 warns about ("Scripts inside React components are never executed
 * when rendering on the client"). We avoid that by handling FOUC prevention
 * via Next.js <Script strategy="beforeInteractive"> in the root layout, and
 * keeping theme state in a plain React context here.
 *
 * Public API is intentionally compatible with next-themes so all callsites
 * (ThemeToggle, Sonner) work without changes beyond the import path.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  createElement,
} from 'react';
import type { ReactNode, JSX } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface UseThemeProps {
  theme: Theme | undefined;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme | undefined;
  systemTheme: ResolvedTheme | undefined;
  themes: Theme[];
  forcedTheme: Theme | undefined;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'theme';
const ALL_THEMES: Theme[] = ['light', 'dark', 'system'];

const ThemeCtx = createContext<UseThemeProps>({
  theme: undefined,
  setTheme: () => {},
  resolvedTheme: undefined,
  systemTheme: undefined,
  themes: ALL_THEMES,
  forcedTheme: undefined,
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): UseThemeProps {
  return useContext(ThemeCtx);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ThemeProviderProps {
  children: ReactNode;
  /** Starting theme. Defaults to "system". */
  defaultTheme?: Theme;
  // The following props are accepted for API-compat with next-themes but are
  // either implicit (attribute="class" is always used) or no-ops here.
  attribute?: string;
  enableSystem?: boolean;
  enableColorScheme?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
  nonce?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: ThemeProviderProps): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme | undefined>(undefined);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme | undefined>(undefined);

  // Initialise from localStorage once mounted (client-only)
  useEffect(() => {
    const sys = getSystemTheme();
    setSystemTheme(sys);

    let stored: Theme | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {}

    const initial: Theme = stored ?? defaultTheme;
    const resolved: ResolvedTheme = initial === 'system' ? sys : initial;

    setThemeState(initial);
    setResolvedTheme(resolved);
    applyClass(resolved);

    // Track system-preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSysChange = (e: MediaQueryListEvent) => {
      const newSys: ResolvedTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(newSys);
      setThemeState(prev => {
        if (prev === 'system') {
          setResolvedTheme(newSys);
          applyClass(newSys);
        }
        return prev;
      });
    };
    mq.addEventListener('change', onSysChange);
    return () => mq.removeEventListener('change', onSysChange);
  }, [defaultTheme]);

  const setTheme = useCallback((t: Theme) => {
    const sys = getSystemTheme();
    const resolved: ResolvedTheme = t === 'system' ? sys : t;
    setThemeState(t);
    setResolvedTheme(resolved);
    applyClass(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  return createElement(
    ThemeCtx.Provider,
    {
      value: {
        theme,
        setTheme,
        resolvedTheme,
        systemTheme,
        themes: ALL_THEMES,
        forcedTheme: undefined,
      },
    },
    children,
  );
}
