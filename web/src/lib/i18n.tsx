/**
 * Lightweight i18n layer — no runtime dependency, offline-safe in the APK.
 *
 * Mirrors the style of `theme.tsx`: a React context plus a `localStorage`
 * preference. Two locales ship with the app (`de`, `en`); German remains the
 * catalog of record (every key is defined there first, `en.ts` is typed
 * against it, so a missing translation is a compile error).
 *
 * Locale resolution when nothing is stored: `navigator.language` decides,
 * with German as the final fallback.
 *
 * Besides the React context there is a module-level *active locale*
 * (`activeLocale()` / `translate()`). Non-React helpers — date formatting in
 * `format.ts`, metric labels, chart axis ticks — read that instead of taking a
 * locale parameter through every call site. The provider keeps it in sync
 * synchronously *before* it re-renders, so a render never observes a stale
 * value.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { de } from '../locales/de';
import { en } from '../locales/en';

export type Locale = 'de' | 'en';

export const LOCALES: Locale[] = ['de', 'en'];

/** Message keys — German is the catalog of record. */
export type MessageKey = keyof typeof de;

/** Values interpolated into `{placeholder}` slots. */
export type TVars = Record<string, string | number>;

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { de, en };

/** BCP-47 tag for `Intl.*` and `<html lang>`. */
export const INTL_LOCALE: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

const KEY = 'mediary.locale';

function isLocale(v: unknown): v is Locale {
  return v === 'de' || v === 'en';
}

/** Stored preference, or null when the user never chose one. */
function storedLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // Restrictive WebViews can deny localStorage — fall back to detection.
    return null;
  }
}

/** Browser preference (`navigator.language`/`languages`), German as fallback. */
export function detectLocale(): Locale {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const tags = [...(nav?.languages ?? []), nav?.language].filter(Boolean) as string[];
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'en') return 'en';
    if (base === 'de') return 'de';
  }
  return 'de';
}

/** Effective locale at startup: explicit choice beats browser detection. */
export function initialLocale(): Locale {
  return storedLocale() ?? detectLocale();
}

// ───────────────────────── module-level active locale ─────────────────────────

let active: Locale = initialLocale();

/** Current locale for non-React helpers (`format.ts`, `metrics.ts`, charts). */
export function activeLocale(): Locale {
  return active;
}

/** BCP-47 tag of the current locale, for `Intl.*` constructors. */
export function activeIntlLocale(): string {
  return INTL_LOCALE[active];
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Translate outside React (helpers, `Intl`-adjacent formatting, non-component
 * modules). Inside components prefer `useT()` so a locale switch re-renders.
 * Unknown keys fall back to German, then to the key itself — a missing string
 * degrades to something readable instead of throwing.
 */
export function translate(key: MessageKey, vars?: TVars, locale: Locale = active): string {
  const template = CATALOGS[locale][key] ?? de[key] ?? key;
  return interpolate(template, vars);
}

// ───────────────────────── React binding ─────────────────────────

export interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: TVars) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => active);

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    // Keep the module-level locale in sync *before* re-rendering, so helpers
    // reading `activeLocale()` during that render already see the new value.
    active = l;
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* preference stays session-only when storage is unavailable */
    }
    setLocaleState(l);
  }, []);

  const value = useMemo<I18nCtx>(
    () => ({ locale, setLocale, t: (key, vars) => translate(key, vars, locale) }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

/** Shorthand for the common case: `const t = useT()`. */
export function useT(): I18nCtx['t'] {
  return useI18n().t;
}
