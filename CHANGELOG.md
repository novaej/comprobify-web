# Changelog

All notable changes to `comprobify-web` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [Unreleased]

### Added
- **Marketing site** — `(marketing)` route group with landing page (`/`) and pricing page (`/pricing`); public, unauthenticated, served on the marketing domain; landing page redirects authenticated users to `/dashboard`
- **Domain-aware routing** — `src/proxy.ts` now distinguishes marketing hosts (`comprobify.com`, `staging.comprobify.com`) from app hosts (`app.comprobify.com`, `app-staging.comprobify.com`) via `DOMAIN_PAIR` and issues 301 cross-domain redirects to keep each domain serving only its routes; localhost and unknown hosts bypass hostname routing
- `marketing`, `landing`, and `pricing` i18n namespaces added to `messages/es.json` and `messages/en.json`
- **Sentry error monitoring** — `@sentry/nextjs` integrated with client, server, and edge configs; `src/instrumentation.ts` boots the SDK and wires `onRequestError` for automatic Server Action / Route Handler crash capture; `src/app/global-error.tsx` root error boundary reports client-side crashes; disabled locally (no DSN set), active on staging/production with environment tagging via `APP_ENV`
- **Comprobify logomark favicon** — `src/app/icon.svg` replaces the default Next.js favicon; uses the `logomark-light.svg` mark
- **Notification system** — real-time notifications delivered via webhooks and surfaced in a bell icon in the sidebar; unread badge auto-refreshes every 60 seconds; panel lists all notifications with relative timestamps and per-item mark-read
- **Webhook receiver** — `POST /api/webhooks/receive` verifies HMAC-SHA256 signatures and upserts incoming notifications into the local `notifications` table; fan-out logic creates `NotificationRead` rows for Owner/Admin (all) and per-issuer rows for other roles with `UserIssuerAccess`
- **Catch-up sync on page load** — `<NotificationSync />` fires `catchUpNotificationsAction()` on first authenticated mount, pulling any missed notifications from the API into the local DB in case webhooks were dropped during downtime
- **Cert-expiry banner** — `<CertExpiryBanner>` shown above page content when an unread `CERT_EXPIRING` or `CERT_EXPIRED` notification exists for the active issuer; amber styling for expiring, destructive red for expired; dismiss calls `markNotificationReadAction` so it won't reappear until a new unread cert alert arrives
- **Webhook settings screen** — `GET /settings/webhooks` (Owner/Admin only) lets users register a webhook endpoint URL + event types, view active endpoints with last-four of secret, and delete endpoints; includes a collapsible signature verification code block
- **Notification preferences screen** — `GET /settings/notifications` (Owner/Admin only) shows live-type toggles (`DOCUMENT_AUTHORIZED`, `CERT_EXPIRING`, `CERT_EXPIRED`) with optimistic UI; reserved types shown as coming-soon
- **Complete registration flow** — invited users who click their invite link and open the app are now correctly redirected to `/complete-registration` instead of getting an `INVALID_CREDENTIALS` error; `completeRegistrationAction` hashes their password and activates their account in one shot, then signs them in and routes to onboarding/dashboard
- **`Notification`, `NotificationRead`, `WebhookEndpoint` Prisma models** — migration `20260601124000_add_notifications_and_webhooks`
- **`listNotifications`, `markNotificationRead`, `getNotificationPreferences`, `updateNotificationPreferences`, `registerWebhookEndpoint`, `listWebhookEndpoints`, `updateWebhookEndpoint`, `deleteWebhookEndpoint`** added to `src/lib/api.ts`
- **`notifications.read`, `notifications.manage`, `webhooks.manage` permissions** added to `src/lib/rbac.ts`; Owner + Admin get manage; all roles get read
- **`complete-registration`** added to `PUBLIC_ROUTES` in `src/proxy.ts`
- Settings page cards linking to `/settings/notifications` and `/settings/webhooks` (gated by respective permissions)
- `certBanner`, `notifications`, `webhooks`, `notificationPreferences`, `completeRegistration`, `completeRegistrationError` i18n namespaces added to `messages/es.json` and `messages/en.json`

### Fixed
- **Invited users could not authenticate** — `authorize()` returns `null` for users with no `passwordHash`, causing `signIn()` to throw `AuthError` and fall through to `INVALID_CREDENTIALS`; fixed by pre-checking `inviteStatus` before `signIn()` and redirecting to `/complete-registration` when appropriate
- **Notification `issuerId` matched against wrong field** — cert-expiry banners now compare `notification.issuerId` (API-side BIGSERIAL) against `Issuer.apiIssuerId`, not the local Prisma `Issuer.id`
- **`appUrl` variable conflict in onboarding.ts** — second `const appUrl` declaration renamed to `webhookAppUrl`

---

## [Unreleased — previous]

### Added
- **Client management** — CRUD screen at `/clients` (Users icon in nav) to save frequent clients; fields: ID type, ID number, name, email, address (optional); stored in the app's own `clients` table (Prisma), scoped per user
- **Invoice form: client lookup** — a search icon button on the buyer ID field looks up a saved client by exact ID number and pre-fills ID type, name, email, and address; hidden when Consumidor Final is selected or no clients are saved
- **Product catalog** — CRUD screen at `/catalog` (Package icon in nav) to save products and services; fields: main code, aux code, description, unit price, IVA rate; stored in the app's own `products` table (Prisma)
- **Invoice form: product search combobox** — the `mainCode` field in each line-item row now shows a dropdown as you type, filtering catalog products by code or description; selecting one auto-fills main code, aux code, description, unit price, and IVA rate for that row
- **Invoice form: guía de remisión field** — optional `NNN-NNN-NNNNNNNNN` field in the invoice header, validated client-side and passed to the API as `guiaRemision`
- **Invoice form: auxiliary code per item** — `auxCode` column in the line-items table, maps to `codigoAuxiliar` in the SRI XML
- **Invoice form: multiple payment methods** — payment section is now a dynamic table; each row supports `term` (plazo) and `termUnit` (unidadTiempo); quick-add buttons for Efectivo, Tarjeta de débito, Tarjeta de crédito
- **Invoice form: additional fields section** — dynamic table of `{name, value}` pairs sent as `infoAdicional/campoAdicional` in the XML
- **Invoice form: live catalog dropdowns** — ID type, payment method, and IVA rate selects populated from `GET /api/catalogs/*` fetched server-side; shows DB descriptions instead of hardcoded strings
- **Invoice form: Consumidor Final auto-fill** — selecting ID type `07` auto-populates the ID with `9999999999999` and locks the field
- **Invoice form: single-payment auto-sync** — when there is exactly one payment row its amount tracks the computed invoice total (read-only); adding a second row unlocks both for manual split entry
- **Invoice form: expanded totals panel** — per-rate subtotals (15%, 5%, 0%, no-obj, exempt), total discount, IVA breakdown, and valor a pagar
- **`listCatalogIdTypes`, `listCatalogPaymentMethods`, `listCatalogTaxRates`** added to `src/lib/api.ts` with `CatalogIdType`, `CatalogPaymentMethod`, `CatalogTaxRate` types
- **`InvoiceCatalogs` type** exported from `src/app/[locale]/invoices/new/page.tsx` for use by `InvoiceForm`

### Changed
- **Invoice form discount is now absolute USD** — was incorrectly treated as a percentage in the totals calculation; the API has always expected an absolute value
- **Invoice form IVA options filtered to active SRI codes** — only rate codes `0, 4, 5, 6, 7` shown; historical codes excluded via `IVA_RATE_CODES` constant in `invoice-form.tsx`
- **Invoice form page fills available width** — `max-w-2xl` constraint removed; form now fills the content area like other pages
- **Invoice form layout** — payments and totals share an equal `lg:grid-cols-2` row; all other cards are full-width

### Fixed
- **`SelectValue` in Base UI requires a render function** — `@base-ui/react` v1.4.1 `Select.Value` renders the raw value (the code) by default; fixed by passing a lookup function as children to map codes to descriptions
- **`CatalogTaxRate.rate` typed as `string | number`** — PostgreSQL returns `DECIMAL` columns as strings; calling `.toFixed()` on the raw value caused a runtime error; fixed with `Number(r.rate)`

- Email verification page at `GET /[locale]/verify-email` — public route, updates `emailVerified` in Prisma using the email returned by the API, works session-independently (any device/browser)
- `resendVerificationAction` passes `verificationRedirectUrl` so re-sent emails link to the frontend instead of the raw API URL
- Email verification notice (`EmailVerificationNotice`) shown proactively on Settings when the user's email is unverified
- Production promotion flow (`ProductionPromotion`) — gated behind email verification; calls `POST /api/admin/issuers/:id/promote` then creates a new production API key
- Resend verification email option with 60-second cooldown in both the verification notice and the production promotion card
- Language switcher (ES/EN) in the sidebar nav
- Multi-user authentication with Auth.js v5 (credentials provider — email + password)
- PostgreSQL users table via Prisma 7 with `comprobifyApiKey`, `comprobifyIssuerId`, and `emailVerified` columns
- Issuer self-service registration in Settings — P12 certificate upload, RUC, business name, branch/issue-point codes, document types, and initial sequentials
- `setupIssuerAction` with hardened error handling and `verificationRedirectUrl` forwarding
- `promoteToProductionAction` for sandbox → production environment promotion
- Dashboard invoice table with API integration and per-row status badges
- Invoice creation form (React Hook Form + Zod) with buyer fields, line items, and taxes
- Invoice Detail page with document actions: send email, download XML/PDF, retry email
- Client-side status polling via TanStack Query for documents in `RECEIVED` state (stops after 2 minutes or on status change)
- Document type filtering — issuer-specific document types fetched on Settings load
- Multi-type initial sequentials and `requiredAccounting` flag in issuer setup form
- Sandbox banner shown when `COMPROBIFY_SANDBOX=true`
- Mobile-responsive layout throughout (Tailwind responsive prefixes, `overflow-x-auto` table wrappers)
- Initial Next.js 16 (App Router) scaffold with TypeScript and Tailwind CSS v4
- next-intl localization with Spanish default (`es`) and English (`en`) locales
- `src/lib/api.ts` — typed Comprobify API client (server-only, BFF pattern)
- `src/lib/errors.ts` — `ApiError` class wrapping RFC 7807 Problem Details
- `src/providers/query-provider.tsx` — TanStack Query client provider
- `src/components/nav.tsx` — sidebar navigation (Dashboard, Nueva factura, Configuración)
- `src/components/status-badge.tsx` — color-coded document status badge
- `src/components/sandbox-banner.tsx` — yellow sandbox mode banner
- `GET /api/documents/:key/status` Next.js proxy route for client-side polling
- shadcn/ui components: badge, button, card, table, input, label, select, textarea, separator, skeleton, dialog, sonner
- Full ADR documentation (ADR-001 through ADR-006)
- Coding guides, documentation checklist, and code-flow walkthrough
- `.example.env` with all required environment variables

### Fixed
- Nav menu now shows all items (Dashboard, Nueva Factura) immediately after issuer setup without requiring a manual page reload — `setupIssuerAction` now redirects server-side and calls `revalidatePath('/', 'layout')` to clear the Next.js Router Cache entry for the shared layout
- Dark mode warning colors corrected for status badges, sandbox banner, email verification notice, and polling timeout banner — previous `*-950/20` tints were invisible on the navy dark background; replaced with `*-500/10–15` backgrounds and `*-300` text
- `setupIssuerAction` hardened against partial failures: API key and issuer ID logged before DB write so they are always recoverable
- Registration error handling adapted to idempotent `POST /api/register` (returns recovery key on conflict)
- `resendVerificationEmail` now passes `verificationRedirectUrl` so verification links in re-sent emails point to the frontend
- Cursor-pointer styling added to resend buttons and the "Go to Settings" link on the verify-email page
- `@prisma/adapter-pg` used for Prisma 7 runtime database connection compatibility
