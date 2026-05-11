# CLAUDE.md

Primary guide for AI coding assistants working on `comprobify-web`. This file is loaded automatically into context. Every rule here takes precedence over AI defaults.

---

## Project Overview

**Comprobify Web** — Next.js 16 (App Router) frontend for the Comprobify electronic invoice API. Allows non-technical users to create, send, and authorize Ecuadorian electronic invoices (facturas electrónicas) from a browser without touching the API directly.

The frontend calls the Comprobify REST API over HTTP. It is **not** a standalone backend — it is a UI layer (BFF pattern).

**Related repo:** `comprobify` (the API) at `../comprobify/`

---

## Commands

```bash
npm run dev           # start dev server (port 3000)
npm run build         # production build
npm run start         # serve production build
npm run type-check    # tsc --noEmit
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query (client polling only) |
| Localization | next-intl (Spanish default) |
| Auth | MVP: single env var API key — see ADR-003 |

---

## Architecture

```
Browser
  └─► Next.js Server (Server Components, Server Actions, Route Handlers)
          └─► Comprobify API  (Bearer token — never sent to browser)
```

Layer rules:
- **Server Components** — initial page renders, data fetching for display
- **Server Actions** — mutations (create, send, rebuild, email retry)
- **API Route proxies** (`src/app/api/`)— client-side polling only (TanStack Query)
- **Client Components** — interactive UI only (forms, polling hooks, nav active state)

```
src/
  app/
    layout.tsx              root layout (html/body, lang from next-intl)
    [locale]/
      layout.tsx            locale layout (NextIntlClientProvider, QueryProvider, Nav)
      dashboard/page.tsx    Server Component — invoice list
      invoices/
        new/page.tsx        Server Component shell + Client form
        [key]/page.tsx      Server Component shell + Client polling
      settings/page.tsx     Server Component
      login/page.tsx        Public — Auth.js credentials login form
      register/page.tsx     Public — account registration form
      verify-email/page.tsx Public — email token verification (session-independent)
    api/
      documents/[key]/status/route.ts   Proxy for TanStack Query polling
  components/
    ui/                     shadcn generated — do not edit manually
    nav.tsx                 Client Component sidebar
    status-badge.tsx        Document status pill
    sandbox-banner.tsx      Yellow banner when COMPROBIFY_SANDBOX=true
    email-verification-notice.tsx  Yellow notice + resend button when email unverified
    production-promotion.tsx       Card to promote sandbox issuer to production
  lib/
    api.ts                  Typed Comprobify API client (server-only)
    errors.ts               ApiError class + ProblemDetails type
  i18n/
    routing.ts              next-intl locale config (locales, defaultLocale)
    request.ts              getRequestConfig (loads message files)
    navigation.ts           Typed Link, redirect, usePathname, useRouter
  providers/
    query-provider.tsx      TanStack QueryClientProvider
  middleware.ts             next-intl routing middleware
messages/
  es.json                   Spanish (default, always complete)
  en.json                   English (secondary, kept in sync)
```

---

## CRITICAL RULES

1. **Never import `src/lib/api.ts` in client components** — it reads `process.env.COMPROBIFY_API_KEY` which is server-only. Importing it in a client component will expose the key or silently use `undefined`.
2. **Never expose `COMPROBIFY_API_KEY` to the browser** — no `NEXT_PUBLIC_` prefix, no passing it through props, no returning it from Server Actions unless behind an explicit "reveal" user action.
3. **Import `Link`, `redirect`, `usePathname`, `useRouter` from `@/i18n/navigation`** — not from `next/navigation`. The i18n navigation helpers preserve locale context.
4. **All user-visible strings go in `messages/es.json` and `messages/en.json`** — no hardcoded Spanish or English strings in components. Use `useTranslations` (client) or `getTranslations` (server).
5. **`setRequestLocale(locale)` must be called at the top of every async page/layout** — required for static rendering with next-intl. Missing it causes hydration errors in production.
6. **`globals.css` is imported only in `src/app/layout.tsx`** — importing it again in a locale layout causes duplicate style injection.
7. **shadcn components in `src/components/ui/` are never edited manually** — re-run `npx shadcn@latest add` to update them. Put customisations in wrapper components.
8. **Client components must have `'use client'` at the top** — hooks (`useTranslations`, `usePathname`, `useState`) require it. Server Components must not have it.
9. **Server Actions must have `'use server'` at the top** — mutation functions called from forms or buttons.
10. **Keep TanStack Query only for polling** — page-level data fetching uses Server Components (no `useQuery` for initial load). See ADR-005.
11. **All UI changes must be mobile-responsive** — use Tailwind responsive prefixes (`sm:`, `md:`) throughout. Stack layouts on mobile (`flex-col`, single-column grids) and expand on larger screens. Wrap every `<Table>` in `<div className="overflow-x-auto">`. Do not hardcode widths that would overflow on small screens.

---

## Key Patterns

**BFF (Backend-for-Frontend):** `src/lib/api.ts` is the only place that calls the Comprobify API. All its functions accept `apiKey` as the first parameter — call `requireApiKey()` from `src/lib/auth-token.ts` to obtain it in Server Components, Server Actions, and Route Handlers. See `docs/adr/002-bff-pattern.md`.

**Auth (multi-user):** Auth.js v5 (next-auth@beta) with a JWT session and a PostgreSQL users table via Prisma. The `comprobifyApiKey` column is never exposed in the session or JWT — it lives in the DB only and is fetched via `requireApiKey()`. The session exposes only `{ id, email, environment, hasIssuer }` — read fresh from the DB on every `auth()` call so UI reflects changes immediately.

**Issuer provisioning:** uses `src/lib/admin-api.ts` with `COMPROBIFY_ADMIN_SECRET` to call the Comprobify admin endpoints. Registration creates only an account (email + password). Issuer setup happens in Settings via `setupIssuerAction` which calls `POST /api/admin/issuers`. Promoting to production calls `POST /api/admin/issuers/:id/promote` then creates a new production API key.

**Localization:** Every visible string goes through next-intl. Add keys to `messages/es.json` first, then mirror in `messages/en.json`. Map API `code` fields (e.g. `DOCUMENT_NOT_FOUND`) to user messages via the `apiError` namespace. See `docs/adr/006-next-intl-localization.md`.

**Status polling:** When a document is in `RECEIVED` status, the Invoice Detail page polls `GET /api/documents/:key/status` (a Next.js proxy route) every 5 seconds using TanStack Query. The proxy forwards to the Comprobify API server-side. Polling stops when status changes or after 2 minutes. See `docs/adr/005-tanstack-query-polling.md`.

**Sandbox mode:** `COMPROBIFY_SANDBOX=true` in the server environment triggers the yellow banner in `SandboxBanner` and the environment badge in Settings. Mirrors `issuers.sandbox` on the API side.

**Error handling:** The Comprobify API returns RFC 7807 Problem Details on all errors. `ApiError` in `src/lib/errors.ts` wraps these. In Server Actions, catch `ApiError` and pass `error.code` to the i18n `apiError` namespace for user-friendly messages.

**Form → Server Action flow:**
1. Client component renders the form (React Hook Form + Zod client-side validation)
2. On submit, calls a Server Action (async function with `'use server'`)
3. Server Action calls `src/lib/api.ts` with the validated payload
4. On success, calls `redirect()` to the Invoice Detail page
5. On `ApiError`, returns `{ error: error.code }` for the client to display

**Catalog fetching:** SRI lookup tables (ID types, payment methods, tax rates) live in the API database and are fetched server-side at page load via `listCatalogIdTypes`, `listCatalogPaymentMethods`, `listCatalogTaxRates` in `src/lib/api.ts`. The page fetches all three in parallel and passes them as props to the Client Component form. This keeps selects in sync with the DB without hardcoding strings in the frontend. The IVA rate options are further filtered client-side by the `IVA_RATE_CODES` constant in `invoice-form.tsx` to exclude historical rates.

**Product catalog:** Users can save products/services in the app's own `products` table (Prisma). The catalog page (`/catalog`) provides full CRUD via `src/app/actions/catalog.ts`. On the invoice creation page, all products for the user are fetched server-side alongside the SRI catalogs and passed to `InvoiceForm` as `catalogs.products`. The `ProductSearch` combobox in each line-item row filters products client-side as the user types, then fills all item fields on selection. The dropdown is rendered via `createPortal(…, document.body)` with `position: fixed` to escape the `overflow-x-auto` table wrapper. ICE and IVA turismo fields are intentionally excluded — the invoice API does not currently support them.

**Base UI `SelectValue` display:** `@base-ui/react` Select.Value does not mirror the selected item's children text — it renders the raw `value` string by default. To show a human-readable label, pass a render function as children:
```tsx
<SelectValue>
  {(value: string | null) => catalog.find((x) => x.code === value)?.description ?? value}
</SelectValue>
```

---

## Next.js 16 Breaking Changes

This project runs Next.js **16** (not 13-15). Key differences from older versions:

1. **`src/middleware.ts` → `src/proxy.ts`** — the file convention was renamed. The export must be named `proxy` (not `default` or `middleware`). next-intl's `createMiddleware` still works — just rename the file and the export: `export const proxy = createMiddleware(routing)`.

2. **shadcn/ui uses Base UI instead of Radix UI** — components like `Button` no longer have an `asChild` prop. To render a link as a button, apply `buttonVariants()` class to the `<Link>` directly instead of wrapping with `<Button asChild>`.

3. **`params` is a `Promise`** — in Next.js 16, all page/layout params are async: `params: Promise<{ locale: string }>`. Always `await params` before accessing properties.

4. **Read `node_modules/next/dist/docs/`** before using any Next.js API — the docs bundled with the package reflect the actual installed version.

---

## Common Mistakes to Avoid

1. Using `next/navigation`'s `Link`/`redirect`/`usePathname` instead of `@/i18n/navigation` — breaks locale context and produces wrong URLs.
2. Calling `getTranslations` in a Client Component — use `useTranslations` instead (it reads from the provider).
3. Adding `'use client'` to a page that only needs a small interactive piece — extract only the interactive part into a client component.
4. Forgetting `setRequestLocale(locale)` in a page — causes stale locale in nested server components.
5. Hardcoding currency formatting — always use `Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })`.
6. Adding a new message key to only one locale file — always update both `es.json` and `en.json` together.
7. Using TanStack Query `useQuery` for initial page data — only use it for the polling proxy route.
8. Making fetch calls from client components to the Comprobify API directly — all calls go through server-side code or the proxy route.
9. Adding `NEXT_PUBLIC_` prefix to `COMPROBIFY_API_KEY` — this exposes the key to the browser.
10. Editing `src/components/ui/` files directly — they are auto-generated by shadcn. Use wrapper components.
11. Using `<SelectValue />` with no children when populating options from a catalog — Base UI renders the raw `value` (the code) instead of the label. Always pass a render function: `<SelectValue>{(v) => catalog.find(x => x.code === v)?.description ?? v}</SelectValue>`.
12. Redirecting from a Server Action without calling `revalidatePath('/', 'layout')` first when the action changes session-derived layout props (e.g. `hasIssuer`, `environment`) — Next.js performs a soft navigation and reuses the cached layout RSC payload, so the Nav and other layout elements appear stale until a manual reload. Always call `revalidatePath('/', 'layout')` before `redirect()` in those actions.
13. Wrapping `redirect()` in a broad `try/catch` without re-throwing `NEXT_REDIRECT`
14. Rendering an absolutely-positioned dropdown inside an `overflow-x-auto` container — the overflow clips it. Use `createPortal(…, document.body)` with `position: fixed` and coordinates from `getBoundingClientRect()` instead. — `redirect()` works by throwing a special error with `digest` starting with `'NEXT_REDIRECT'`. If a catch block swallows it (e.g. returning `{ error: 'UNEXPECTED_ERROR' }`), the redirect never fires. Re-throw it: `if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;`

---

## Key Files

| File | Purpose |
|------|---------|
| `GETTING_STARTED.md` | Local setup guide |
| `docs/guides/documentation-checklist.md` | What to update for each change type |
| `docs/guides/code-flow.md` | Request lifecycle walkthrough |
| `docs/guides/coding-guidelines.md` | How to add screens, actions, and components |
| `docs/adr/` | Architecture Decision Records |
| `docs/deployment.md` | Branching strategy, Vercel setup, env vars, production checklist |
| `src/lib/api.ts` | Typed Comprobify API client — all API calls go through here |
| `src/lib/errors.ts` | `ApiError` + `ProblemDetails` types |
| `src/middleware.ts` | next-intl routing middleware (locale detection + redirect) |
| `src/i18n/routing.ts` | Locale list, default locale, prefix strategy |
| `src/i18n/navigation.ts` | Typed navigation helpers (import these, not next/navigation) |
| `src/i18n/request.ts` | `getRequestConfig` — loads message files per locale |
| `src/providers/query-provider.tsx` | TanStack QueryClientProvider |
| `src/components/nav.tsx` | Sidebar navigation (Client Component) |
| `src/components/status-badge.tsx` | Document status pill with i18n labels |
| `src/components/sandbox-banner.tsx` | Yellow sandbox mode banner |
| `src/components/email-verification-notice.tsx` | Yellow notice with resend button shown when email is unverified |
| `src/components/production-promotion.tsx` | Card to promote sandbox issuer to production (gated on email verification) |
| `src/app/[locale]/layout.tsx` | Locale layout with providers + nav |
| `src/app/[locale]/verify-email/page.tsx` | Public email verification page — reads token from query string, updates Prisma by email (no session required) |
| `src/app/actions/settings.ts` | Server Actions for issuer setup, production promotion, and resend verification |
| `src/app/actions/invoice.ts` | `createInvoiceAction` — builds `CreateDocumentPayload` from form data and calls `createDocument`; exports `InvoiceFormData` type |
| `src/app/actions/catalog.ts` | Server Actions for product catalog CRUD; exports `CatalogProduct` type |
| `src/components/invoice-form.tsx` | Invoice creation form (React Hook Form + Zod); accepts `InvoiceCatalogs` prop; catalog-driven selects, Consumidor Final auto-fill, single-payment auto-sync, product search combobox |
| `src/app/[locale]/invoices/new/page.tsx` | Server Component — fetches SRI catalogs + user products in parallel, passes as props to `InvoiceForm`; exports `InvoiceCatalogs` type |
| `src/app/[locale]/catalog/page.tsx` | Server Component — fetches user products from DB, renders `ProductCatalog` |
| `src/components/product-catalog.tsx` | Client Component — product catalog CRUD table with add/edit/delete dialogs |
| `src/app/api/documents/[key]/status/route.ts` | Proxy for TanStack Query polling |
| `messages/es.json` | Spanish translations (default — always complete) |
| `messages/en.json` | English translations (secondary — kept in sync) |
| `.example.env` | Environment variable template |

---

## Git Commit Conventions

Format: `type: short description` (max 72 chars, imperative mood, no period)

| Type | Use for |
|------|---------|
| `feat` | new screen or feature |
| `fix` | bug fix |
| `refactor` | code change with no behaviour change |
| `style` | CSS / styling only |
| `i18n` | translation file changes |
| `docs` | documentation only |
| `chore` | dependencies, tooling, config |
