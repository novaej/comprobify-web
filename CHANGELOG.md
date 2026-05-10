# Changelog

All notable changes to `comprobify-web` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [Unreleased]

### Added
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
