# Agreements Gate (`/agreements`)

## Purpose

Intercepts authenticated users when the tenant has not yet accepted the latest version of any legal document (TERMS, PRIVACY, or DPA). Shows a checkbox-per-document acceptance form; only on full acceptance does the user proceed to `/dashboard`.

## Access

- Any authenticated user with a tenant (`tenantId` set)
- No permission check — all roles are subject to the gate
- Public URL (`/agreements`) but requires a valid session; guests are redirected to login first

## Entry Point

The locale layout (`src/app/[locale]/layout.tsx`) calls `getAgreementStatus()` (`GET /v1/tenants/agreements`) on every render. If `status.needsAcceptance === true`, it redirects to `/agreements` instead of loading the page. The gate is therefore transparent — users never navigate to `/agreements` manually.

## Layout

A minimal centered card (`max-w-2xl`) with no Nav, no SandboxBanner, no CertExpiryBanner. The full locale layout still wraps it (so `NextIntlClientProvider` is available), but the redirect fires before any other page-level content renders.

## Components

| Component | File |
|-----------|------|
| `AgreementAcceptance` | `src/components/agreement-acceptance.tsx` |

## Behavior

1. Page calls `getAgreementStatusAction()` server-side. If no acceptance is needed it immediately redirects to `/dashboard` (idempotent — safe to call on every load).
2. `AgreementAcceptance` receives the list of `outdated` agreement documents sorted by type priority: TERMS → PRIVACY → DPA.
3. Each document is shown as a card with:
   - Document type label
   - A "View" link that opens the document in an `<iframe>` modal (URL served by `GET /api/tenant/agreements/:type`)
   - A "Print" button inside the modal
   - A checkbox the user must tick to acknowledge they've read it
4. The "Aceptar y continuar" submit button is disabled until every checkbox is ticked.
5. On submit, `acceptAgreementsAction()` calls `POST /v1/tenants/agreements`:
   - Fetches the current TERMS version from `listAgreements()` (public) for the audit trail
   - Forwards the browser's `User-Agent` and, once `INTERNAL_SERVICE_SECRET` is set, real visitor IP from the incoming request (`src/lib/client-forwarding.ts`) so the API records the real client identity in `tenant_agreements` instead of this app's own droplet egress IP
   - On success: `revalidatePath('/', 'layout')` to clear the gate, then `router.push('/dashboard')`
   - On error: inline error message (generic fallback if code not in `apiError` namespace)

## Data

| Source | Description |
|--------|-------------|
| `getAgreementStatus()` (`GET /v1/tenants/agreements`) | Returns `{ needsAcceptance: boolean, outdated: ApiOutdatedAgreement[] }` |
| `listAgreements()` (`GET /v1/agreements`, public) | Used server-side to look up the current TERMS version |
| `acceptAgreements()` (`POST /v1/tenants/agreements`) | Records acceptance with version + UA |

## i18n Namespace

`agreements` — keys: `title`, `description`, `termsLabel`, `privacyLabel`, `dpaLabel`, `viewButton`, `printButton`, `accept`, `allRequired`

## Edge Cases

- If no agreements have been published yet, `needsAcceptance` is `false` and the gate never fires.
- On API error in `getAgreementStatusAction()`, the page throws and the locale error boundary catches it (generic `apiError.UNKNOWN` message).
- The acceptance form can't be submitted partially — `allChecked` must be true.
