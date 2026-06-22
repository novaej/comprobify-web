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
| Auth | Auth.js v5 (next-auth@beta) — JWT session `{ id, email }` only; tenant API keys stored encrypted in `TenantApiKey` table; RBAC with 5 roles via `src/lib/rbac.ts` |
| Monitoring | Sentry (`@sentry/nextjs`) — disabled locally (no DSN), active on staging/production; environment tagged via `APP_ENV` / `NEXT_PUBLIC_APP_ENV` |

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
      (marketing)/
        layout.tsx          Marketing layout — public header + footer; no Nav/auth
        page.tsx            Landing page — hero + feature cards; redirects authed users to /dashboard
        pricing/page.tsx    Pricing page — plan comparison cards
      dashboard/page.tsx    Server Component — invoice list
      invoices/
        new/page.tsx        Server Component shell + Client form
        [key]/page.tsx      Server Component shell + Client polling
      onboarding/tenant/page.tsx  First-time org setup (P12 upload, RUC, branch)
      issuer/select/page.tsx      Issuer picker shown when no cookie or multiple issuers
      issuers/page.tsx      Issuer management — document types, cert expiry/fingerprint, logo per issuer
      api-keys/page.tsx     API key list/create/revoke
      users/page.tsx        User invite/role/remove management
      settings/page.tsx              Tenant settings — environment badge + promotion
      settings/notifications/page.tsx  Notification preferences (Owner/Admin)
      settings/webhooks/page.tsx       Webhook endpoint management (Owner/Admin)
      complete-registration/page.tsx   Public — invited user sets password
      login/page.tsx        Public — Auth.js credentials login form
      register/page.tsx     Public — account registration (no tenant)
      verify-email/page.tsx Public — email token verification (session-independent)
    api/
      documents/[key]/status/route.ts  Proxy for TanStack Query polling
      webhooks/receive/route.ts        Webhook receiver — HMAC-verified, upserts Notification rows
  components/
    ui/                     shadcn generated — do not edit manually
    nav.tsx                 Client Component sidebar (TenantBadge, IssuerSwitcher, UserMenu, NotificationBell)
    notification-bell.tsx   Bell icon with unread badge; refreshes on open + every 60 s
    notification-panel.tsx  Dropdown list with mark-read per item
    notification-sync.tsx   Invisible client component — fires catchUpNotificationsAction on mount
    cert-expiry-banner.tsx  Dismissible amber/red banner for CERT_EXPIRING / CERT_EXPIRED alerts
    webhook-manager.tsx     Register/delete webhook endpoints (Client Component)
    notification-preferences.tsx  Optimistic-UI preference toggles (Client Component)
    complete-registration-form.tsx  Invited-user password-set form
    status-badge.tsx        Document status pill
    sandbox-banner.tsx      Yellow banner when tenant.environment === 'sandbox'
    email-verification-notice.tsx  Yellow notice + resend button when email unverified
    production-promotion.tsx       Card to promote sandbox tenant to production (Owner only)
  lib/
    api.ts                  Typed Comprobify API client (server-only); functions take ApiCtx
    context.ts              requireContext() / requirePermission() / hasContextPermission()
    context-cookie.ts       Signed httpOnly cookie helpers (read/write/clear comprobify_ctx)
    crypto.ts               AES-256-GCM encrypt/decrypt for TenantApiKey at rest
    rbac.ts                 Role/Permission types + ROLE_PERMISSIONS map
    public-api.ts           Unauthenticated API calls (registerTenant, verifyEmailToken, resendVerificationEmail)
    errors.ts               ApiError class + ProblemDetails type
  i18n/
    routing.ts              next-intl locale config (locales, defaultLocale)
    request.ts              getRequestConfig (loads message files)
    navigation.ts           Typed Link, redirect, usePathname, useRouter
  providers/
    query-provider.tsx      TanStack QueryClientProvider
  proxy.ts                  next-intl routing middleware (Next.js 16 renamed convention)
messages/
  es.json                   Spanish (default, always complete)
  en.json                   English (secondary, kept in sync)
```

---

## CRITICAL RULES

1. **Never import `src/lib/api.ts` in client components** — it is `server-only`. Use `requireContext()` from `src/lib/context.ts` to get the `ApiCtx` in Server Components and Server Actions. Importing it in a client component will throw at build time.
2. **Never expose the user's Comprobify API key to the browser** — it lives only in the `TenantApiKey` table (encrypted), decrypted inside `requireContext()`, and never stored in the JWT or session. Do not pass it through props or return it from Server Actions.
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

**BFF (Backend-for-Frontend):** `src/lib/api.ts` is the only place that calls the Comprobify API. All its functions accept `ApiCtx { apiKey: string; issuerId?: number }` as the first parameter. Call `requireContext()` from `src/lib/context.ts` to obtain it — this loads the tenant, issuer, permissions, and decrypted API key in one shot. See `docs/adr/002-bff-pattern.md`.

**Auth (multi-tenant):** Auth.js v5 (next-auth@beta) with a JWT session trimmed to `{ id, email }` only. Tenant, issuer, role, and permissions are resolved on every server request by `requireContext()`, which: (1) verifies the session, (2) loads the `User` → `Tenant` chain from DB, (3) resolves the active issuer from the signed `comprobify_ctx` cookie, (4) decrypts the active `TenantApiKey`. Use `requirePermission(code)` to gate by permission and `hasContextPermission(code)` for conditional Server Component rendering.

**Tenant onboarding:** New users (no `tenantId`) are redirected to `/onboarding/tenant`, which offers two tabs (`OnboardingTabs`). **Create new company** — `bootstrapTenantAction` calls `registerTenant()` from `src/lib/public-api.ts` (→ `POST /v1/register`), then creates `Tenant` + `TenantApiKey` + `Issuer` + updates `User.tenantId` and `User.role='Owner'` in a single DB transaction, and sets the `comprobify_ctx` issuer cookie. **Link existing API account** — for users who already registered directly via the Comprobify API: `linkExistingTenantAction` takes a pasted API key, calls `getCurrentTenant()` (`GET /v1/tenants/me`) and `listTenantIssuers()` (`GET /v1/issuers`) to resolve identity, then mints a *fresh* dedicated key via `createTenantApiKey()` (`POST /v1/keys`) — the pasted key is never stored, only used in-memory to authenticate the linking calls. `Tenant.apiTenantId` is `@unique`, so a given API tenant can only be linked once; a second attempt returns `TENANT_ALREADY_LINKED`. The first user to link becomes `Owner`; everyone else joins via the existing invite flow (`inviteUserAction` in `/users`). Both actions share `registerWebhookBestEffort()` for the non-fatal webhook auto-registration tail.

**Issuer provisioning:** First issuer created during onboarding. Additional branches added via `/issuers` (`createBranchAction` → `POST /api/issuers`). Promoting to production calls `promoteTenantAction` (Owner-only) → `POST /api/tenants/promote`, which revokes all sandbox `TenantApiKey` rows and inserts new production keys.

**Issuer editing (logo only):** The Comprobify API has no update endpoint for an existing issuer's business data (RUC, name, address) or its certificate — those are set once at creation (`POST /v1/issuers`) and never changed afterward. The *only* mutable field is the logo, via `PATCH /v1/issuers/:id/logo` (multipart, PNG/JPEG/GIF, ≤500KB, used in PDF/RIDE generation, never displayed in the web UI). `/issuers` exposes this as a "Cambiar logo" dialog per card (Owner/Admin, `issuers.manage`) calling `updateIssuerLogoAction` → `uploadIssuerLogo()` in `src/lib/api.ts`. The same page also renders cert expiry + fingerprint per issuer by calling `listTenantIssuers()` (a tenant-wide `GET /v1/issuers` call) and matching each row to the local `Issuer` by `String(issuer.apiIssuerId) === apiIssuer.id` — the local Prisma `Issuer` table does not store cert fields, only the API does. The expiry badge thresholds (>30d ok, 8–30d warning, ≤7d/expired critical) mirror `comprobify/src/services/notification.service.js`'s `CERT_WARN_DAYS`/`CERT_ERROR_DAYS` so the UI agrees with the cert-expiry notifications.

**Back navigation:** Sub-pages render a "‹ Parent" link via `PageHeader`'s `backHref`/`backLabel` props (or the same `ChevronLeft` + muted-`Link` snippet inline, for pages with a custom header like `invoices/[key]`). Pages with exactly one possible parent hardcode `backHref`/`backLabel`. Pages reachable from **multiple** parent screens (`/invoices/new`, `/invoices/[key]` — linkable from Panel, Comprobantes, and per-type document lists) instead read a `?from=<key>` query param, resolved against the `BACK_TARGETS` allowlist in `src/lib/back-targets.ts`, and every entry-point link must append the matching `from` value (see `DocumentTable`'s `from` prop and the `createHref` links in `documents/page.tsx` / `documents/[type]/page.tsx`). **Adding a new multi-entry sub-page means registering it in `BACK_TARGETS` and updating each entry-point link by hand — this does not happen automatically.** Locale-switching (`UserMenu.handleLocaleChange` in `nav.tsx`) must preserve `useSearchParams().toString()` when calling `router.replace`, or the `from` param (and any other query state) is silently dropped and the back link resets to its default.

**Localization:** Every visible string goes through next-intl. Add keys to `messages/es.json` first, then mirror in `messages/en.json`. Map API `code` fields (e.g. `DOCUMENT_NOT_FOUND`) to user messages via the `apiError` namespace. See `docs/adr/006-next-intl-localization.md`.

**Status polling:** When a document is in `RECEIVED` status, the Invoice Detail page polls `GET /api/documents/:key/status` (a Next.js proxy route) every 5 seconds using TanStack Query. The proxy forwards to the Comprobify API server-side. Polling stops when status changes or after 2 minutes. See `docs/adr/005-tanstack-query-polling.md`.

**Sandbox mode:** The `environment` column on the `tenants` table (`'sandbox'` | `'production'`) drives the yellow `SandboxBanner` and the environment badge in Settings. It starts as `'sandbox'` and is flipped to `'production'` once on promotion. There is no `COMPROBIFY_SANDBOX` env var — sandbox state is per-tenant, not global.

**Error handling:** The Comprobify API returns RFC 7807 Problem Details on all errors. `ApiError` in `src/lib/errors.ts` wraps these. In Server Actions, catch `ApiError` and pass `error.code` to the i18n `apiError` namespace for user-friendly messages.

**Form → Server Action flow:**
1. Client component renders the form (React Hook Form + Zod client-side validation)
2. On submit, calls a Server Action (async function with `'use server'`)
3. Server Action calls `src/lib/api.ts` with the validated payload
4. On success, calls `redirect()` to the Invoice Detail page
5. On `ApiError`, returns `{ error: error.code }` for the client to display

**Catalog fetching:** SRI lookup tables (ID types, payment methods, tax rates) live in the API database and are fetched server-side at page load via `listCatalogIdTypes`, `listCatalogPaymentMethods`, `listCatalogTaxRates` in `src/lib/api.ts`. The page fetches all three in parallel and passes them as props to the Client Component form. This keeps selects in sync with the DB without hardcoding strings in the frontend. The IVA rate options are further filtered client-side by the `IVA_RATE_CODES` constant in `invoice-form.tsx` to exclude historical rates.

**Client management:** Clients are saved in the app's own `clients` table (Prisma), scoped per **tenant** (shared by all users in the same org). The CRUD screen is at `/clients`. On the invoice creation page, the tenant's clients are fetched server-side and passed as `catalogs.clients`. A search icon button next to the buyer ID field does an exact `idNumber` lookup and fills name, email, address, and ID type when a match is found. Every DB operation uses `updateMany`/`deleteMany` scoped to `tenantId` so one tenant can never touch another's records.

**Product catalog:** Products are saved in the app's own `products` table (Prisma), scoped per **tenant**. The catalog page (`/catalog`) provides full CRUD via `src/app/actions/catalog.ts`. On the invoice creation page, all tenant products are fetched server-side alongside the SRI catalogs and passed to `InvoiceForm` as `catalogs.products`. The `ProductSearch` combobox in each line-item row filters products client-side as the user types, then fills all item fields on selection. The dropdown is rendered via `createPortal(…, document.body)` with `position: fixed` to escape the `overflow-x-auto` table wrapper. ICE and IVA turismo fields are intentionally excluded — the invoice API does not currently support them.

**Document templates:** Full invoices (buyer, line items, payment methods, additional fields) can be saved as reusable templates via `src/app/actions/templates.ts`, backed by the `DocumentTemplate` Prisma model — scoped per **tenant**, not sent to or read from the Comprobify API. The model's `documentType` column defaults to `'01'` (invoices) but is a real, generic column (`@@unique([tenantId, documentType, name])`) so other SRI document types can reuse the same table once they get a create flow — today only invoices do. `saveInvoiceTemplateAction` runs an `upsert` keyed on `(tenantId, documentType, name)`, so saving under an existing name overwrites it; `InvoiceForm` shows an inline warning when the typed name matches an existing template, and pre-fills that name after a template is loaded so re-saving defaults to "update." The stored `data` JSON is the exact same shape as `InvoiceFormData` (`src/app/actions/invoice.ts`) — `toInvoiceFormData`/`templateToFormValues` in `invoice-form.tsx` convert between that and the form's Zod-validated `InvoiceFormValues` (which use `''` for empty optional fields instead of `undefined`).

**Base UI `SelectValue` display:** `@base-ui/react` Select.Value does not mirror the selected item's children text — it renders the raw `value` string by default. To show a human-readable label, pass a render function as children:
```tsx
<SelectValue>
  {(value: string | null) => catalog.find((x) => x.code === value)?.description ?? value}
</SelectValue>
```

**Marketing site / domain routing:** The `(marketing)` route group under `src/app/[locale]/` holds all public-facing pages (landing `/` and pricing `/pricing`). These render a standalone header+footer layout with no Nav or auth. `src/proxy.ts` enforces domain separation: `MARKETING_HOSTS` (`comprobify.com`, `staging.comprobify.com`) only serve marketing routes and issue 301 redirects to `DOMAIN_PAIR[host]` for anything else; `APP_HOSTS` (`app.comprobify.com`, `app-staging.comprobify.com`) redirect marketing routes to the marketing host. Localhost and unknown hosts bypass hostname routing so local dev works without configuration. `pricing` is added to `PUBLIC_ROUTES` so unauthenticated users can reach it.

**Notification system:** Notifications arrive via webhook (`POST /api/webhooks/receive`), are upserted into the local `notifications` table, and surfaced in the sidebar bell. `<NotificationSync />` fires a catch-up on every authenticated page load. The bell auto-refreshes every 60 seconds. `notification.issuerId` stores the **API-side** issuer ID (BIGSERIAL → integer) — always compare against `Issuer.apiIssuerId`, never `Issuer.id`. Fan-out: Owner/Admin receive all notifications; other roles only receive issuer-scoped ones if they have a matching `UserIssuerAccess` row; tenant-level notifications (`issuerId = null`) go to all active users.

**Webhook receiver HMAC:** The receiver route (`src/app/api/webhooks/receive/route.ts`) must call `request.text()` **before** any `JSON.parse()` to preserve the raw body for signature verification. Calling `request.json()` first consumes the stream and makes the raw body unavailable for HMAC comparison.

**Error monitoring (Sentry):** `@sentry/nextjs` captures unhandled errors across all runtimes. `src/instrumentation.ts` boots the server/edge SDK via Next.js's `register()` hook and wires `onRequestError` so every Server Component, Server Action, and Route Handler crash that **propagates unhandled** is reported automatically. Errors caught and swallowed inside a `try/catch` (to return a friendly `{ error: CODE }` instead of crashing) do **not** get this automatic capture — call `Sentry.captureException(err)` explicitly in those catch blocks, or the failure leaves no trace (see Common Mistake #23). `src/app/global-error.tsx` is the root client-side error boundary — it calls `Sentry.captureException` before showing a recovery UI. Sentry is **disabled locally** (SDK skips `init` when no DSN is set); set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel and tag the env with `APP_ENV=staging` or `APP_ENV=production`. The `org` value in `withSentryConfig()` (`next.config.ts`) must be the organization **slug** (Settings → General Settings), not the numeric ID embedded in the DSN hostname (`o<id>.ingest...`) — using the latter makes every build fail source map upload with `Project not found`.

**Complete registration (invited users):** Auth.js `authorize()` returns `null` for users with no `passwordHash`, so `signIn()` throws `AuthError` — invited users cannot authenticate the normal way. `loginAction` pre-checks `inviteStatus` + `passwordHash` **before** calling `signIn()` and redirects to `/complete-registration` when appropriate. `completeRegistrationAction` validates the invite is still pending, hashes the password, marks the user `ACTIVE`, signs them in, and calls `postLoginRedirect()`. The route is in `PUBLIC_ROUTES` in `src/proxy.ts`.

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
9. Leaking the user's Comprobify API key to the browser — it must stay server-side only, decrypted via `requireContext()`. Never pass it as a prop, include it in the session, or return it from a Server Action.
10. Editing `src/components/ui/` files directly — they are auto-generated by shadcn. Use wrapper components.
11. Using `<SelectValue />` with no children when populating options from a catalog — Base UI renders the raw `value` (the code) instead of the label. Always pass a render function: `<SelectValue>{(v) => catalog.find(x => x.code === v)?.description ?? v}</SelectValue>`.
12. Redirecting from a Server Action without calling `revalidatePath('/', 'layout')` first when the action changes layout-visible data (e.g. tenant name, environment, issuer list) — Next.js performs a soft navigation and reuses the cached layout RSC payload, so the Nav and other layout elements appear stale until a manual reload. Always call `revalidatePath('/', 'layout')` before `redirect()` in those actions.
13. Wrapping `redirect()` in a broad `try/catch` without re-throwing `NEXT_REDIRECT` — applies both inside the Server Action itself and in any Client Component that `await`s the action call in its own `try/catch`. `redirect()` works by throwing a special error with `digest` starting with `'NEXT_REDIRECT'`. If a catch block swallows it (e.g. returning `{ error: 'UNEXPECTED_ERROR' }` or calling `setError(...)`), the redirect either never fires, or — as happened in `IssuerSetupForm`/`LinkExistingAccountForm` — a stray error message flashes on screen before the redirect eventually goes through. Re-throw it: `if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;`
14. Rendering an absolutely-positioned dropdown inside an `overflow-x-auto` container — the overflow clips it. Use `createPortal(…, document.body)` with `position: fixed` and coordinates from `getBoundingClientRect()` instead.
15. **Writing `api.ts` interfaces without verifying against the actual API source** — the types are hand-maintained with no code generation. Every time a new function is added or an existing one modified, open `../comprobify/src/controllers/` and trace the exact `res.json(...)` fields, then follow every service/presenter function the controller calls. Writing an interface based on the function name or assumed conventions will produce silent runtime failures (fields come back `undefined`, actions silently do nothing, DB writes fail). See `docs/guides/coding-guidelines.md → "Adding a new API endpoint call"` for the full procedure.
16. **Typing API `id` fields as `number`** — PostgreSQL `BIGSERIAL`/`BIGINT` columns are serialized as JavaScript **strings** by Node's `pg` library before `res.json()` encodes them. Every `id` field from the API arrives as a JSON string (`"42"`, not `42`). Always type these as `string` in the interface and apply `Number(record.id)` at the Prisma write site. Forgetting this causes a Prisma type error or a silent `NaN` stored in an `Int` column.
17. **Using an API field name that differs from the actual response** — common mismatches: `active` vs `isActive`, `apiKey` vs `key`, `label` vs `name`. Always read the controller's `res.json()` verbatim; do not infer field names from context.
18. **Assuming a `POST` response contains the created record's `id`** — several endpoints (key creation, promotion) return only a token or minimal data with no `id`. If downstream code needs the `id` (e.g. to store in Prisma), make a follow-up `GET` call with the new token and read the id from the list result.
19. **Calling `request.json()` before HMAC verification in a webhook route** — `request.json()` consumes the body stream; the raw body is then unavailable. Always call `request.text()` first, store the raw string, then `JSON.parse()` it. Without the raw body the HMAC signature cannot be verified and every webhook will be rejected or accepted insecurely.
20. **Comparing `notification.issuerId` against local `Issuer.id`** — `notification.issuerId` stores the API-side BIGSERIAL issuer ID, not the local Prisma autoincrement id. Match it against `Issuer.apiIssuerId`. Getting this wrong means cert-expiry banners never appear (or appear for the wrong issuer).
21. **Hardcoding `backHref` on a sub-page reachable from more than one parent screen** — e.g. `/invoices/new` and `/invoices/[key]` are linkable from Panel, Comprobantes, and per-type document lists. A fixed `backHref` always returns the user to the same place regardless of where they came from. Use the `?from=<key>` + `BACK_TARGETS` allowlist pattern (`src/lib/back-targets.ts`) instead — see "Back navigation" above — and remember to append `from` on every entry-point link.
22. **Rebuilding a URL from `usePathname()` alone when switching locale** — `UserMenu.handleLocaleChange` in `nav.tsx` used to call `router.replace(pathname, { locale })`, which drops the query string. Any contextual state carried in query params (e.g. `?from=...` for back-navigation) is silently lost on language switch, and the UI quietly falls back to its default. Always append `useSearchParams().toString()` to the path before calling `router.replace`/`router.push` with a new locale.
23. **Catching a non-`ApiError` exception in a Server Action without calling `Sentry.captureException(err)`** — the standard pattern (`docs/guides/coding-guidelines.md → "Adding a Server Action"`) re-throws unknown errors so Next.js's `onRequestError` hook reports them to Sentry automatically. But `bootstrapTenantAction`/`linkExistingTenantAction` in `src/app/actions/onboarding.ts` deliberately catch the post-API-call DB transaction's errors instead of re-throwing, to avoid showing a raw crash page after an external side effect (a live Comprobify API key) already succeeded. Catching instead of re-throwing opts out of automatic Sentry capture — call `Sentry.captureException(err)` explicitly before returning the generic error code, or the failure becomes undebuggable.
24. **Setting `ENCRYPTION_KEY` (or any AES key env var) with `openssl rand -base64 32`** — `getKey()` in `src/lib/crypto.ts` strictly requires a 64-character hex string and throws `ENCRYPTION_KEY must be a 32-byte hex string` otherwise, which surfaces to users as a generic `DB_WRITE_FAILED`/internal-error message with no obvious cause. Always generate with `openssl rand -hex 32`, never `-base64`. (`AUTH_SECRET` and `CONTEXT_COOKIE_SECRET` have no such validation and accept either format.)

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
| `src/lib/api.ts` | Typed Comprobify API client — all API calls go through here; functions take `ApiCtx` |
| `src/lib/context.ts` | `requireContext()`, `requirePermission()`, `hasContextPermission()` |
| `src/lib/context-cookie.ts` | Signed `comprobify_ctx` cookie helpers |
| `src/lib/crypto.ts` | AES-256-GCM `encrypt`/`decrypt`/`lastFour` for API keys at rest |
| `src/lib/rbac.ts` | `Role`, `Permission` types + `ROLE_PERMISSIONS` map |
| `src/lib/public-api.ts` | Unauthenticated API calls (`registerTenant`, `verifyEmailToken`, `resendVerificationEmail`) |
| `src/lib/errors.ts` | `ApiError` + `ProblemDetails` types |
| `src/lib/back-targets.ts` | `BACK_TARGETS` allowlist + `isBackTargetKey` guard for the `?from=` contextual back-navigation pattern |
| `src/proxy.ts` | next-intl routing middleware (locale detection + unauthenticated redirect) |
| `src/i18n/routing.ts` | Locale list, default locale, prefix strategy |
| `src/i18n/navigation.ts` | Typed navigation helpers (import these, not next/navigation) |
| `src/i18n/request.ts` | `getRequestConfig` — loads message files per locale |
| `src/providers/query-provider.tsx` | TanStack QueryClientProvider |
| `src/components/nav.tsx` | Sidebar navigation (Client Component) |
| `src/components/status-badge.tsx` | Document status pill with i18n labels |
| `src/components/sandbox-banner.tsx` | Yellow sandbox mode banner |
| `src/components/email-verification-notice.tsx` | Yellow notice with resend button shown when email is unverified |
| `src/components/production-promotion.tsx` | Card to promote sandbox issuer to production (gated on email verification) |
| `src/app/[locale]/(marketing)/layout.tsx` | Marketing layout — public header, nav links, footer; wraps landing + pricing |
| `src/app/[locale]/(marketing)/page.tsx` | Landing page — hero, feature cards; auto-redirects authenticated users to dashboard |
| `src/app/[locale]/(marketing)/pricing/page.tsx` | Pricing page — plan comparison cards (Sandbox / Starter / Pro) |
| `src/app/[locale]/layout.tsx` | Locale layout with providers + nav |
| `src/app/[locale]/verify-email/page.tsx` | Public email verification page — reads token from query string, updates Prisma by email (no session required) |
| `src/app/actions/auth.ts` | `loginAction` (post-login routing), `registerAction`, `logoutAction` (clears cookie + signOut) |
| `src/app/actions/onboarding.ts` | `bootstrapTenantAction` (create new tenant) and `linkExistingTenantAction` (link an existing API account) — both create Tenant + TenantApiKey + Issuer + set cookie in one transaction |
| `src/components/onboarding-tabs.tsx` | Client Component — switches between `IssuerSetupForm` and `LinkExistingAccountForm` on `/onboarding/tenant` |
| `src/components/link-existing-account-form.tsx` | API-key paste form for linking an existing Comprobify API account |
| `src/app/actions/context.ts` | `selectIssuerAction` (sets cookie), `clearContextAction` |
| `src/app/actions/tenant.ts` | `promoteTenantAction` (Owner-only), `updateTenantAction`, `resendVerificationAction` |
| `src/app/actions/issuers.ts` | `createBranchAction`, `addDocumentTypeAction`, `removeDocumentTypeAction`, `updateIssuerLogoAction` |
| `src/components/issuer-manager.tsx` | Client Component — issuer cards on `/issuers`: document type add/remove, cert expiry/fingerprint badge, "Cambiar logo" dialog |
| `src/app/actions/apiKeys.ts` | `createTenantApiKeyAction` (returns cleartext key once), `revokeTenantApiKeyAction` |
| `src/app/actions/users.ts` | `inviteUserAction`, `updateUserRoleAction`, `removeUserAction`, `setUserIssuerAccessAction` |
| `src/app/actions/invoice.ts` | `createInvoiceAction` — builds `CreateDocumentPayload` from form data and calls `createDocument`; exports `InvoiceFormData` type |
| `src/app/actions/clients.ts` | Server Actions for client CRUD; exports `SavedClient` type; all ops scoped to `tenantId` |
| `src/app/actions/catalog.ts` | Server Actions for product catalog CRUD; exports `CatalogProduct` type; all ops scoped to `tenantId` |
| `src/app/actions/templates.ts` | `listInvoiceTemplatesAction`, `saveInvoiceTemplateAction` (upsert by name), `deleteInvoiceTemplateAction`; exports `SavedDocumentTemplate` type; all ops scoped to `tenantId` + `documentType` |
| `src/app/actions/notifications.ts` | `listNotificationsAction`, `markNotificationReadAction`, `catchUpNotificationsAction`, `getUnreadCountAction`, `getPreferencesAction`, `updatePreferencesAction` |
| `src/app/actions/webhooks.ts` | `registerWebhookAction`, `deleteWebhookAction`, `listWebhooksAction`, `ensureWebhookRegisteredAction` (Owner/Admin; `webhooks.manage` permission) |
| `src/app/api/webhooks/receive/route.ts` | Webhook receiver — verifies HMAC-SHA256; upserts `Notification`; fans out `NotificationRead` rows |
| `src/instrumentation.ts` | Next.js instrumentation hook — boots Sentry server/edge SDK on startup; wires `onRequestError` for automatic crash capture |
| `src/app/global-error.tsx` | Root client-side error boundary — captures exceptions to Sentry and shows a recovery UI |
| `sentry.client.config.ts` | Sentry browser SDK init (session replays, env tag) |
| `sentry.server.config.ts` | Sentry Node.js server SDK init |
| `sentry.edge.config.ts` | Sentry edge runtime SDK init |
| `src/app/[locale]/settings/notifications/page.tsx` | Server Component — notification preference toggles (Owner/Admin) |
| `src/app/[locale]/settings/webhooks/page.tsx` | Server Component — webhook endpoint management (Owner/Admin) |
| `src/app/[locale]/complete-registration/page.tsx` | Public — invited user sets password; bounces already-authenticated users |
| `src/components/notification-bell.tsx` | Bell icon + unread badge; auto-refreshes every 60 s; opens `NotificationPanel` |
| `src/components/notification-panel.tsx` | Dropdown notification list with mark-read per item |
| `src/components/notification-sync.tsx` | Invisible client component — fires `catchUpNotificationsAction` on first mount |
| `src/components/cert-expiry-banner.tsx` | Dismissible cert-expiry/expired banner (amber / destructive) rendered in locale layout |
| `src/components/webhook-manager.tsx` | Register/delete webhook endpoints with signature code snippet |
| `src/components/notification-preferences.tsx` | Optimistic-UI preference toggles; reverts on server error |
| `src/components/complete-registration-form.tsx` | Invited-user password form — email prefilled from `?email=` param |
| `src/components/invoice-form.tsx` | Invoice creation form (React Hook Form + Zod); accepts `InvoiceCatalogs` prop; catalog-driven selects, Consumidor Final auto-fill, single-payment auto-sync, product search combobox, save/load/delete document templates |
| `src/app/[locale]/invoices/new/page.tsx` | Server Component — fetches SRI catalogs + user products/clients/templates in parallel, passes as props to `InvoiceForm`; exports `InvoiceCatalogs` type |
| `src/app/[locale]/clients/page.tsx` | Server Component — fetches tenant clients from DB, renders `ClientCatalog` |
| `src/components/client-catalog.tsx` | Client Component — client CRUD table with add/edit/delete dialogs |
| `src/app/[locale]/catalog/page.tsx` | Server Component — fetches tenant products from DB, renders `ProductCatalog` |
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
