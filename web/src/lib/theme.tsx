import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeCtx {
  pref: ThemePref;
  resolved: 'light' | 'dark';
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = 'mediary.theme';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(
    () => (localStorage.getItem(KEY) as ThemePref) || 'system',
  );
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    (pref === 'system' ? systemDark() : pref === 'dark') ? 'dark' : 'light',
  );

  useEffect(() => {
    const apply = () => {
      const r = (pref === 'system' ? systemDark() : pref === 'dark') ? 'dark' : 'light';
      setResolved(r);
      document.documentElement.setAttribute('data-theme', r);
      const meta = document.querySelector('meta[name="theme-color"]:not([media])');
      if (meta) meta.setAttribute('content', r === 'dark' ? '#151310' : '#F4EFE7');
    };
    apply();
    if (pref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [pref]);

  const setPref = (p: ThemePref) => {
    localStorage.setItem(KEY, p);
    setPrefState(p);
  };
  const toggle = () => setPref(resolved === 'dark' ? 'light' : 'dark');

  return <Ctx.Provider value={{ pref, resolved, setPref, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
