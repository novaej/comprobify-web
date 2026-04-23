# ADR-006: next-intl for Localization

**Status:** Accepted  
**Date:** 2026-04-22

## Context

The UI targets Ecuadorian users — Spanish is the primary language. English is included from the start to avoid a painful migration later (learned from projects that hardcode Spanish strings and then face a 2-week i18n backlog when the first English-speaking client arrives).

## Decision

Use **next-intl v4** with:
- **Locales:** `['es', 'en']` — Spanish default, English secondary
- **Default locale:** `'es'`
- **Locale prefix:** `'always'` — all URLs include the locale (`/es/dashboard`, `/en/dashboard`)
- **Message files:** `messages/es.json` (always complete) + `messages/en.json` (kept in sync)

**No language switcher in MVP** — English locale is in the codebase but not exposed in the UI. Add the switcher in Phase 2 when the first non-Spanish client onboards.

## What goes in message files

- Navigation labels, button text, form labels, placeholders
- Validation error messages
- Document status labels (map API values: `SIGNED` → "Firmado")
- API error codes (map `code` from RFC 7807 response to user-friendly messages via `apiError` namespace)
- Page titles and headings

## What does NOT go in message files

- SRI XML element names (fixed by SRI spec, never displayed)
- API field names in JSON payloads (internal)
- Database-stored document content (stored as entered)

## Important setup rules

1. Import `Link`, `redirect`, `usePathname`, `useRouter` from `@/i18n/navigation` — not from `next/navigation`. The i18n navigation helpers preserve locale in URLs.
2. Call `setRequestLocale(locale)` at the top of every async page/layout — required for static rendering.
3. In Server Components, use `getTranslations('namespace')`.
4. In Client Components, use `useTranslations('namespace')` (reads from `NextIntlClientProvider`).
5. `NextIntlClientProvider` is in the locale layout — it receives the full message object from `getMessages()`.

## Number and date formatting

- Amounts: `Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })` — Ecuador uses USD with `.` decimal separator
- Dates: `Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' })` — or use the DD/MM/YYYY format returned by the API directly

## Consequences

- Every visible string must be in a message file (no hardcoded UI text)
- Both locale files must be updated together when adding new keys
- The `[locale]` segment in the URL catches both `es` and `en` routes
- Missing translation keys throw in development (fast feedback) and fall back silently in production
