# ADR-003: Authentication — Single Env Var (MVP) → Multi-user → Multi-tenant

**Status:** Phase 4 (super admin) implemented (2026-06-30)
**Date:** 2026-04-22

## Context

The Comprobify frontend needs authentication. Options considered:

1. **Single env var API key** — no user login, the API key is hardcoded in the server environment
2. **NextAuth.js credentials provider** — email/password login, API key stored in encrypted JWT session
3. **OAuth2 provider** — Google/GitHub login

## Decision

**Start with option 1 (single env var)** for MVP.

The first user is the developer (the issuer). There is one Comprobify API key, set in `COMPROBIFY_API_KEY`. No login screen, no session management.

**Why:** Zero complexity — ship the features first, add auth later.

## Phase 2 — multi-user (superseded by Phase 3)

Auth.js v5 with credentials provider. API key stored per user in the `users` table. Session exposed `{ id, email, environment, hasIssuer }`. Issuer setup via admin API. **Superseded by Phase 3.**

## Phase 3 — multi-tenant (current)

Implemented 2026-05-15 as part of the multitenant rewrite. Key decisions:

1. **Session trimmed to `{ id, email }` only** — all tenant/issuer/permission data resolved server-side by `requireContext()` on each request. No DB round-trip in the JWT session callback.

2. **Multi-tenant data model** — `Tenant`, `TenantApiKey` (encrypted AES-256-GCM), `Issuer`, `UserIssuerAccess` tables. A `User` belongs to one `Tenant`, has a `role`, and an `inviteStatus`.

3. **`requireContext()` in `src/lib/context.ts`** — replaces `requireApiKey()`. Resolves the full context chain: session auth → User → Tenant → active Issuer (from signed `comprobify_ctx` cookie) → decrypts active `TenantApiKey`. Returns a typed `Context` object with `{ user, tenant, issuer, permissions, apiKey }`.

4. **RBAC** — five roles (`Owner`, `Admin`, `BillingOperator`, `Viewer`, `Developer`) with a hardcoded permission map in `src/lib/rbac.ts`. `requirePermission(code)` gates Server Actions; `hasContextPermission(code)` gates Server Component UI branches.

5. **Issuer context cookie** — a signed HMAC cookie (`comprobify_ctx`) carries `{ issuerId, v: 1 }`. Set by `bootstrapTenantAction` and `selectIssuerAction`; cleared by `logoutAction`. *(Superseded by ADR-007: the payload is now `{ issuerId: string, v: 2 }`, carrying the issuer's UUID.)*

6. **Onboarding** — new users (no `tenantId`) redirect to `/onboarding/tenant`. `bootstrapTenantAction` calls `POST /api/register` (public endpoint), then creates `Tenant` + `TenantApiKey` + `Issuer` + updates `User.tenantId` and `User.role='Owner'` in a single DB transaction.

7. **Promotion** — `promoteTenantAction` (Owner-only) calls `POST /api/tenants/promote`, revokes sandbox `TenantApiKey` rows, and inserts new production keys.

## Consequences of Phase 3

- `ENCRYPTION_KEY` and `CONTEXT_COOKIE_SECRET` are now required env vars
- Every server-side API call goes through `requireContext()` to get `ApiCtx { apiKey, issuerId }`
- The BFF pattern (ADR-002) is unchanged — only the source of `ApiCtx` changed

## Phase 4 — super admin (current)

Implemented 2026-06-30. The Comprobify API's `/admin/*` routes (tenant management, payment-proof review, etc.) were always live behind a static `ADMIN_SECRET` bearer token, but the frontend had no UI for them — Phase 3 removed `COMPROBIFY_ADMIN_SECRET` as unused, since onboarding moved to the self-service `POST /v1/register` flow. That env var is now reintroduced for a different purpose: a small `/admin` panel for operating the platform itself (verifying tenants, reviewing payment proofs), separate from any tenant.

1. **`User.isSuperAdmin`** — a single boolean column, default `false`. A super-admin row always has `tenantId = null` and `role = null`; there is no self-service way to create one — it's provisioned manually (DB/seed), matching the "exactly one operator account" requirement.
2. **Session carries `isSuperAdmin`** — `src/auth.ts`'s `authorize()`/`jwt`/`session` callbacks pass it through alongside `id`/`email`, same trimmed-JWT approach as Phase 3 (no extra DB round-trip per request).
3. **`requireSuperAdmin()` in `src/lib/admin-context.ts`** — a guard deliberately separate from `requireContext()`, which assumes a tenant exists. Redirects to `/login` if the session user isn't a super admin.
4. **`src/lib/admin-api.ts`** — a second server-only API client (mirrors `src/lib/api.ts`'s conventions) that calls `${COMPROBIFY_API_URL}/admin/...` with `Authorization: Bearer ${COMPROBIFY_ADMIN_SECRET}` instead of a per-tenant API key.
5. **`postLoginRedirect()`** checks `isSuperAdmin` before any tenant-related branching and sends the user to `/admin` instead of `/onboarding/tenant`.
