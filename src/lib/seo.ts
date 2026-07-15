import { routing } from '@/i18n/routing';

// Base origin of the MARKETING host (comprobify.com / staging.comprobify.com),
// never the app host — see .example.env.
export const MARKETING_BASE_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3000';

// Search engines should only ever index the production marketing domain —
// staging is a real, publicly reachable host and must stay out of results.
export const SEO_INDEXABLE = process.env.NEXT_PUBLIC_APP_ENV === 'production';

// Marketing routes eligible for indexing, relative to a locale prefix
// (e.g. '' -> /es, '/pricing' -> /es/pricing). Mirrors MARKETING_ROUTES in
// src/proxy.ts.
export const MARKETING_ROUTES = ['', '/pricing'] as const;

export function localeAlternates(pathname: string): Record<string, string> {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, `${MARKETING_BASE_URL}/${locale}${pathname}`]),
  );
}
