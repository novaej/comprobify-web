# ADR-003: Authentication — Single Env Var (MVP) → Multi-user → Multi-tenant

**Status:** Phase 3 (multi-tenant) implemented (2026-05-15)
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

5. **Issuer context cookie** — a signed HMAC cookie (`comprobify_ctx`) carries `{ issuerId, v: 1 }`. Set by `bootstrapTenantAction` and `selectIssuerAction`; cleared by `logoutAction`.

6. **Onboarding** — new users (no `tenantId`) redirect to `/onboarding/tenant`. `bootstrapTenantAction` calls `POST /api/register` (public endpoint), then creates `Tenant` + `TenantApiKey` + `Issuer` + updates `User.tenantId` and `User.role='Owner'` in a single DB transaction.

7. **Promotion** — `promoteTenantAction` (Owner-only) calls `POST /api/tenants/promote`, revokes sandbox `TenantApiKey` rows, and inserts new production keys.

## Consequences of Phase 3

- `COMPROBIFY_ADMIN_SECRET` env var removed — admin API no longer used
- `ENCRYPTION_KEY` and `CONTEXT_COOKIE_SECRET` are now required env vars
- Every server-side API call goes through `requireContext()` to get `ApiCtx { apiKey, issuerId }`
- The BFF pattern (ADR-002) is unchanged — only the source of `ApiCtx` changed
