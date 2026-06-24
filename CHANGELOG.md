# Changelog

All notable changes to `comprobify-web` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [Unreleased]

### Added
- **Fixed: malformed invoice access key showed the generic error page instead of 404, and `ApiError.isValidation()` never returned true** — `invoices/[key]/page.tsx` only treated `err.isNotFound()` as "not found"; a wrong-length/non-numeric access key in the URL returns the API's `VALIDATION_FAILED` error instead of `NOT_FOUND`, so it fell through to `error.tsx`. Tracing it down also surfaced a pre-existing bug in `src/lib/errors.ts`: `isValidation()` checked `this.status === 422`, but `../comprobify/src/errors/validation-error.js` returns HTTP **400** for `VALIDATION_FAILED` (and 400 is shared with several unrelated codes like `ISSUER_ID_REQUIRED`/`INVALID_STATE_TRANSITION`, so the fix checks `this.code === 'VALIDATION_FAILED'`, not status). Since `key` is the only param `getDocument()`/`getDocumentEvents()` validate, a validation error on this route can only mean a malformed access key — now also caught and routed to `notFound()`.
- **Locale-aware 404 page** — `src/app/[locale]/not-found.tsx` renders a translated "Page not found" UI with a link back to the dashboard, replacing Next.js's default unstyled 404 for unmatched routes and explicit `notFound()` calls (e.g. a missing invoice on Invoice Detail). New `notFoundPage` i18n namespace. Doesn't cover an invalid `:locale` URL segment itself — see CLAUDE.md Common Mistake #29. Its back-to-dashboard link uses a plain `<a>` tag instead of the app's `Link` component, since client-side navigation from a `notFound()` boundary silently fails to navigate in the Next.js App Router (see Common Mistake #30).
- **Loading skeletons for Dashboard and Invoice Detail** — `src/app/[locale]/dashboard/loading.tsx` and `src/app/[locale]/invoices/[key]/loading.tsx` render shadcn `<Skeleton>` placeholders shaped like each page's actual layout (KPI cards + table rows; header + info grid + events table) while their Server Components fetch, replacing the previous blank screen during navigation.
- **Error boundary for `[locale]` segment** — `src/app/[locale]/error.tsx` catches unhandled Server Component errors and shows a friendly page (icon, generic `apiError.UNKNOWN` message, "Retry"/"Back to dashboard") instead of the framework's blank crash screen. Reports to Sentry via `Sentry.captureException` (same pattern as the existing root `global-error.tsx`). New `errorBoundary` i18n namespace. Note: the specific API error code does not survive the server→client error-boundary serialization, so the message shown is always the generic fallback, not the original `ApiError.code`.
- **PDF preview on Invoice Detail for AUTHORIZED documents** — a "Vista previa PDF" toggle button lazy-mounts an embedded `react-pdf` viewer pointed at the existing `/api/documents/:key/ride` download route (no new endpoint), with a `ResizeObserver`-driven responsive width and Previous/Next controls for multi-page PDFs. New `src/components/invoice-pdf-preview.tsx`, `invoice-pdf-preview-lazy.tsx` (the required `next/dynamic(..., { ssr: false })` Client Component wrapper — Turbopack's production build rejects that option inline in a Server Component), and `invoice-pdf-preview-toggle.tsx`. New deps: `react-pdf` (MIT), `pdfjs-dist` (Apache-2.0, transitive).
- **Rebuild ("Corregir") button for RETURNED/NOT_AUTHORIZED invoices** — Invoice Detail now shows a "Corregir" button for documents the SRI rejected, linking to `/invoices/new?rebuild=:accessKey`, which reuses the create form pre-filled from the document's stored `requestPayload` (new `requestPayloadToFormValues()`, the inverse of the existing create-payload builder). Submitting calls the new `rebuildInvoiceAction` → `POST /v1/documents/:key/rebuild` (same accessKey/sequential, status back to `SIGNED`), sharing the same sign-only / sign-and-send dual-button pattern as invoice creation, just relabeled "Corregir" / "Corregir y Enviar". New `Document.requestPayload` field and wired-up `rebuildDocument()` in `src/lib/api.ts`.
- **Fixed: Invoice Detail's back-link always showed "Panel" after creating or correcting a document** — `createInvoiceAction`/`rebuildInvoiceAction`'s post-submit `redirect()` carried no `?from=` query string, so the `?from=`-based back-link always fell back to its `dashboard` default regardless of where the user actually started (e.g. a per-type document list). Both actions now take a `from?: BackTargetKey` parameter, threaded from the page's own validated `backTargetKey` through `InvoiceForm`, and for the rebuild loop specifically also threaded from Invoice Detail's own `from` through the "Corregir" link. Also fixed the form's bottom "Volver" button, which was hardcoded to `/dashboard` regardless of context — it now uses the same `backHref` the page computes for its header back-link.
- **Sign-only submit on invoice creation** — `/invoices/new` now has two submit buttons: "Firmar y Enviar" (existing behavior — sign and immediately attempt SRI submission) and a new "Firmar" button that signs the document but explicitly skips `sendToSri()`, leaving it in `SIGNED` status. Both share the same confirmation dialog, which swaps its title/description/icon based on which button was clicked. `createInvoiceAction` takes a new `sendAfterSigning: boolean` parameter to gate the send step. A signed-only document is sent later from the existing "Enviar" recovery button on the Invoice Detail page — no new follow-up screen needed.
- **Sorting and filtering on `/documents/[type]`** — Número, Cliente, Fecha, and Estado are now sortable (clickable column headers) and filterable (debounced contains-search on Número/Cliente, a calendar date picker for Fecha, a status select), all stored in the URL and composed correctly with pagination via a shared `buildHref()` helper. New `src/components/document-filters.tsx`; backed by new `sortBy`/`sortDir`/`sequential`/`buyerName` query params on `GET /v1/documents` in `comprobify`. Added a distinct "no results match your filters" empty state (`documents.list.emptyFiltered`) separate from the generic fetch-error message.
- **Dashboard KPI summary cards** — `/dashboard` now shows issued-this-month (by type), net authorized revenue this month (`FAC + LIQ + DEB − CRE`), and an all-time needs-attention count, backed by a new `getDocumentStats()` call to `GET /v1/documents/stats`. The document table below is capped to 10 rows with a "Ver todos" link to `/documents` instead of loading up to 50 rows unpaginated. New `src/components/dashboard-summary-cards.tsx`.
- **Pagination on `/documents/[type]`** — the per-type document list (e.g. `/documents/01`) now pages through results 20 at a time via a `?page=` query param instead of silently truncating at 50, using the `pagination` object already returned by `listDocuments()`. New `src/components/document-pagination.tsx` (generic; reusable by future paginated lists) and `src/components/ui/pagination.tsx` (shadcn).
- **Issuer cert info + logo editing on `/issuers`** — each issuer card now shows its signing certificate's expiry date and fingerprint (fetched via `listTenantIssuers()`, which already returned this data but was unused), color-coded amber/red using the same day thresholds the API uses for `CERT_EXPIRING`/`CERT_EXPIRED` notifications. Added a "Cambiar logo" dialog (Owner/Admin only) backed by the new `uploadIssuerLogo()` in `src/lib/api.ts` and `updateIssuerLogoAction` in `src/app/actions/issuers.ts`, calling `PATCH /v1/issuers/:id/logo` — the only field the Comprobify API allows updating on an existing issuer.
- **Invoice templates** — "Save as template" / "Load template" on the New Invoice form let users save a complete invoice (buyer, line items, payment methods, additional fields) and reload it later instead of re-entering everything. Backed by a new `DocumentTemplate` Prisma model (migration `20260622014656_add_document_templates`), scoped per tenant, with a generic `documentType` column (defaults to `'01'`/invoices) so other SRI document types can reuse it once they get a create flow. Loading shows a preview (buyer, item descriptions, total) so similarly-named templates stay distinguishable; saving over an existing name shows an inline overwrite warning instead of erroring silently. New `src/app/actions/templates.ts` (`listInvoiceTemplatesAction`, `saveInvoiceTemplateAction`, `deleteInvoiceTemplateAction`).
- **Automatic Prisma migrations on deploy** — new `vercel-build` script (`prisma generate && prisma migrate deploy && next build`); Vercel auto-detects and runs it instead of `build`, so every staging/production deploy applies pending migrations before building. `prisma migrate deploy` skips already-applied migrations, so it's a no-op on deploys with no schema change.
- **Link an existing Comprobify API account during onboarding** — `/onboarding/tenant` now offers a second tab alongside "Create new company": paste an existing API key to link that tenant instead of registering a new one. Uses the new `GET /v1/tenants/me` endpoint plus `GET /v1/issuers` to resolve tenant/issuer identity, then mints a fresh dedicated key via `POST /v1/keys` (the pasted key is never stored). `Tenant.apiTenantId` is unique, so an API account can only be linked once; the first linker becomes Owner and invites teammates via the existing `/users` flow. New `linkExistingTenantAction` in `src/app/actions/onboarding.ts`; new `getCurrentTenant` function and `ApiTenantInfo` interface in `src/lib/api.ts`.
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
- **`Pagination.totalPages` was a non-existent API field** — `src/lib/api.ts`'s `Pagination` interface declared `totalPages: number`, but the Comprobify API's `GET /v1/documents` only ever returns `{ total, page, limit }`. No caller read `.totalPages` until the new `/documents/[type]` pager (above), at which point it silently evaluated to `undefined` — the "hide on one page" guard (`undefined <= 1` is `false` in JS) never fired, so pagination controls always rendered, and the "Página X de Y" label showed a blank page count. Removed the field; `totalPages` is now derived client-side via `getTotalPages({ total, limit })` in `src/components/document-pagination.tsx`.
- **Onboarding forms flashed a stray error message before redirecting on success** — `IssuerSetupForm` and `LinkExistingAccountForm` caught the `NEXT_REDIRECT` throw from their Server Action (`bootstrapTenantAction`/`linkExistingTenantAction` both end with `redirect()`) as a generic error and briefly rendered "UNKNOWN" before the redirect completed. Both now re-throw the digest-tagged redirect error instead of swallowing it.
- **Several other swallowed-error catch blocks left no trace in Sentry** — same gap as the onboarding fix above, audited across `src/app/actions/`: `auth.ts`'s `completeRegistrationAction`/`registerAction` fallback catches around `signIn()` (these happen after the password/account write already committed), plus the intentionally non-fatal best-effort catches in `onboarding.ts` (webhook registration), `notifications.ts` (catch-up poll), and `webhooks.ts` (onboarding-tail webhook registration) — all now call `Sentry.captureException` so a systemic failure is visible instead of indistinguishable from working.
- **Onboarding DB-write failures left no trace in Sentry** — `bootstrapTenantAction` and `linkExistingTenantAction` caught their post-API-call transaction errors and returned a generic `DB_WRITE_FAILED` code without re-throwing, which is correct (avoids a crash page after the external Comprobify API key was already minted) but also opts out of `onRequestError`'s automatic capture. Both catch blocks now call `Sentry.captureException(err)` explicitly.
- **Sentry build failed source map upload with `Project not found`** — `org` in `next.config.ts` was set to the numeric ID embedded in the DSN hostname (`o<id>.ingest...`) instead of the organization slug; corrected to the actual slug.
- **Sentry config warnings on every build** — removed `disableLogger` and `automaticVercelMonitors` from `withSentryConfig()`; both are deprecated and their suggested `webpack.*` replacements are explicitly unsupported under Turbopack (which this project builds with), so neither the old nor new option does anything.
- **`.example.env` was missing `ENCRYPTION_KEY` and had the wrong generate command for `CONTEXT_COOKIE_SECRET`** (`-base64 32` instead of `-hex 32`) — likely cause of a staging incident where `ENCRYPTION_KEY` was set to a base64 value; `getKey()` in `src/lib/crypto.ts` requires exactly 64 hex characters and throws otherwise.
- **`COMPROBIFY_API_URL` with a trailing slash caused a silent double-slash 404** — requests became `...com//v1/...`, which the API's router doesn't match; it falls through to a generic HTML 404 instead of a JSON error, crashing `JSON.parse` on the client. Documented as a deploy troubleshooting entry; no code change (the fix is removing the trailing slash from the env var).
- **`ApiIssuer` interface didn't match the API's actual `GET /v1/issuers` response** — declared `id: number` (it's a `BIGSERIAL`, serialized as a JSON string) and a phantom `environment` field that the API never returns (environment is tenant-level, not issuer-level); now matches `issuer.service.js → listIssuers()` exactly, including the previously-missing `certFingerprint` / `certExpiry` fields
- **Invited users could not authenticate** — `authorize()` returns `null` for users with no `passwordHash`, causing `signIn()` to throw `AuthError` and fall through to `INVALID_CREDENTIALS`; fixed by pre-checking `inviteStatus` before `signIn()` and redirecting to `/complete-registration` when appropriate
- **Notification `issuerId` matched against wrong field** — cert-expiry banners now compare `notification.issuerId` (API-side BIGSERIAL) against `Issuer.apiIssuerId`, not the local Prisma `Issuer.id`
- **`appUrl` variable conflict in onboarding.ts** — second `const appUrl` declaration renamed to `webhookAppUrl`

### Changed
- **`shadcn` moved from `dependencies` to `devDependencies`** — it's a CLI tool used only for `npx shadcn@latest add`, never imported at runtime.

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
