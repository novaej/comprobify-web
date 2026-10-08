# RLS call-site inventory (ADR-010, PR 1)

Generated from the converted code. Every protected-table access now goes through `withTenant()` / `asSystem()` in `src/lib/db.ts`; the exported `db` is typed to expose only the unprotected models (`user`, `tenant`, `verificationToken`, `agreementDraft`), so an unwrapped call to a protected model is a `tsc` error.

| File | `withTenant` | `asSystem` | Models touched inside wrappers |
|---|---|---|---|
| `src/app/[locale]/catalog/page.tsx` | 1 | 0 | product |
| `src/app/[locale]/clients/page.tsx` | 1 | 0 | client |
| `src/app/[locale]/credit-notes/new/page.tsx` | 2 | 0 | client, product |
| `src/app/[locale]/invoices/new/page.tsx` | 2 | 0 | client, product |
| `src/app/[locale]/issuer/select/page.tsx` | 2 | 0 | issuer, userIssuerAccess |
| `src/app/[locale]/issuers/[id]/page.tsx` | 1 | 0 | issuer |
| `src/app/[locale]/issuers/page.tsx` | 2 | 0 | issuer, userIssuerAccess |
| `src/app/[locale]/layout.tsx` | 3 | 0 | issuer, userIssuerAccess |
| `src/app/[locale]/settings/api-keys/page.tsx` | 1 | 0 | tenantApiKey |
| `src/app/[locale]/settings/page.tsx` | 1 | 0 | issuer |
| `src/app/[locale]/settings/webhooks/page.tsx` | 1 | 0 | webhookEndpoint |
| `src/app/[locale]/users/page.tsx` | 2 | 0 | issuer, user |
| `src/app/actions/admin.ts` | 3 | 0 | tenantApiKey |
| `src/app/actions/apiKeys.ts` | 4 | 0 | tenantApiKey |
| `src/app/actions/auth.ts` | 3 | 0 | issuer, userIssuerAccess |
| `src/app/actions/catalog.ts` | 4 | 0 | product |
| `src/app/actions/clients.ts` | 3 | 0 | client |
| `src/app/actions/context.ts` | 2 | 0 | issuer |
| `src/app/actions/issuers.ts` | 18 | 0 | issuer |
| `src/app/actions/notifications.ts` | 10 | 0 | issuer, notification, notificationRead, userIssuerAccess |
| `src/app/actions/onboarding.ts` | 0 | 1 | issuer, tenant, tenantApiKey, user |
| `src/app/actions/recovery.ts` | 1 | 1 | issuer, tenant, tenantApiKey, user |
| `src/app/actions/templates.ts` | 3 | 0 | documentTemplate |
| `src/app/actions/tenant.ts` | 2 | 0 | tenant, tenantApiKey |
| `src/app/actions/users.ts` | 5 | 0 | issuer, userIssuerAccess |
| `src/app/actions/webhooks.ts` | 7 | 0 | webhookEndpoint |
| `src/app/api/webhooks/receive/route.ts` | 2 | 0 | notification, webhookEndpoint |
| `src/lib/context.ts` | 2 | 0 | issuer, userIssuerAccess |
| `src/lib/notification-visibility.ts` | 2 | 0 | issuer, userIssuerAccess |
| `src/lib/tenant-api-key.ts` | 4 | 0 | tenantApiKey |

## `asSystem` uses (cross-tenant by necessity)

- `src/app/actions/onboarding.ts`: creates the tenant, its first key and issuer, and attaches the user in one transaction. The tenant does not exist before it.
- `src/app/actions/recovery.ts` (`autoLinkRecoveredTenant`): same shape, for a login found by submitted email.
- `scripts/rotate-encryption-key.js`: re-encrypts every tenant's rows (sets the system flag itself and asserts each UPDATE touched one row).

## Relation loads that cross into protected tables from an unprotected parent (not caught by `tsc`)

- `src/app/[locale]/users/page.tsx`: `user.findMany({ include: { issuerAccess } })` runs inside `withTenant`.
- `src/app/[locale]/layout.tsx`: tenant issuers are fetched separately inside `withTenant` (was a nested select on `tenant`).
- `src/app/actions/auth.ts` (`postLoginRedirect`): the `_count.issuers` is now a `withTenant` count.

## Unprotected, untouched (reason in the ADR)

`users`, `tenants`, `verification_tokens`, `agreement_drafts`: login, registration, reset, invite, session bootstrap, the admin tenant list and the webhook tenant lookup need no wrapper.

## Cannot know the tenant

None of the converted paths: every protected access either has a tenant id in hand or is one of the three `asSystem` cases above.
