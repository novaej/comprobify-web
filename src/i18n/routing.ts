import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['es', 'en'] as const,
  defaultLocale: 'es',
  // Always include locale prefix in URLs: /es/dashboard, /en/dashboard
  // Simpler to reason about and easy to change to 'as-needed' in Phase 2
  localePrefix: 'always',
});
