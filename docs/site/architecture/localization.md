# Localization Architecture

How internationalization works in `comprobify-web` with next-intl.

---

## Setup

```
src/
  middleware.ts          ← intercepts all requests, detects/sets locale
  i18n/
    routing.ts           ← locale list, default, prefix strategy
    request.ts           ← getRequestConfig — loads message files
    navigation.ts        ← typed Link, redirect, usePathname, useRouter
messages/
  es.json                ← Spanish (default, always complete)
  en.json                ← English (secondary, kept in sync)
```

---

## URL structure

Using `localePrefix: 'always'`:
- `/es/dashboard` — Spanish (default locale)
- `/en/dashboard` — English

The next-intl middleware redirects `/` → `/es`. All internal links use the `Link` component from `@/i18n/navigation` which automatically prepends the current locale.

---

## Adding a translation key

1. Add to `messages/es.json` with the Spanish value
2. Add the same key to `messages/en.json` with the English value
3. Use it in a Server Component: `const t = await getTranslations('namespace')`
4. Use it in a Client Component: `const t = useTranslations('namespace')`

**Never add to only one file.** A missing key causes a runtime error in development.

---

## Message file structure

```json
{
  "nav": { ... },              ← Navigation labels
  "sandbox": { ... },          ← Sandbox mode strings
  "status": { ... },           ← Document status labels (SIGNED, AUTHORIZED, etc.)
  "emailStatus": { ... },      ← Email delivery status labels
  "dashboard": { ... },        ← Dashboard page
  "invoiceForm": { ... },      ← Create/rebuild invoice form
  "invoiceDetail": { ... },    ← Invoice detail page
  "settings": { ... },         ← Settings page
  "apiError": { ... },         ← API error code → user message mapping
  "common": { ... }            ← Shared strings (loading, cancel, etc.)
}
```

---

## Mapping API error codes

The Comprobify API returns a stable `code` field (e.g., `DOCUMENT_NOT_FOUND`) in all error responses. Map these to user-friendly messages:

```json
"apiError": {
  "DOCUMENT_NOT_FOUND": "El comprobante no existe.",
  "VALIDATION_ERROR": "Revise los campos marcados en rojo.",
  "TOO_MANY_REQUESTS": "Demasiadas solicitudes. Intente en un momento."
}
```

In a Server Action:
```ts
if (err instanceof ApiError) {
  return { error: err.code };
}
```

In a Client Component:
```tsx
{result?.error && <p>{t(`apiError.${result.error}`)}</p>}
```

---

## Number and date formatting

**Amounts:**
```ts
// Ecuador uses USD with period as decimal separator
new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(115.00)
// → "USD 115,00" (es-EC locale uses comma as decimal)
// The API returns amounts as strings ("115.00") — parse before formatting
```

**Dates:**
- The Comprobify API returns dates in DD/MM/YYYY format
- Use directly for display in most cases
- For date arithmetic: parse with `parse('24/04/2025', 'dd/MM/yyyy', new Date())` from date-fns
