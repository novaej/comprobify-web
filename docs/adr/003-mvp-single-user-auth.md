# ADR-003: Authentication — Single Env Var (MVP) → Multi-user (Phase 2)

**Status:** Superseded — Phase 2 implemented (2026-04-26)
**Date:** 2026-04-22

## Context

The Comprobify frontend needs authentication. Options considered:

1. **Single env var API key** — no user login, the API key is hardcoded in the server environment
2. **NextAuth.js credentials provider** — email/password login, API key stored in encrypted JWT session
3. **OAuth2 provider** — Google/GitHub login

## Decision

**Start with option 1 (single env var)** for MVP.

The first user is the developer (the issuer). There is one Comprobify API key, set in `COMPROBIFY_API_KEY`. Every page load and server action uses that key. No login screen, no session management, no user database.

**Why:**
- Zero complexity — ship the features that matter (creating invoices) before adding auth complexity
- Vercel environment variables provide adequate security for a single-operator tool
- The API key pattern is already established in the Comprobify API — nothing new to build there
- NextAuth can be added later without touching the Comprobify API (ADR-002 pattern is preserved)

## Phase 2 — implemented

Multi-user auth is live. Implementation decisions:

1. **Auth.js v5** (next-auth@beta) with a credentials provider (email + password)
2. **Prisma + PostgreSQL** — `users` table: `email`, `password_hash`, `comprobify_api_key`, `comprobify_issuer_id`, `environment`
3. **`comprobify_api_key` is NOT stored in the JWT or session** — it stays in the DB and is fetched via `requireApiKey()` (`src/lib/auth-token.ts`) on each server request. This avoids JWT-refresh complexity after issuer setup.
4. **Session exposes only safe fields** — `{ id, email, environment, hasIssuer }`, read fresh from the DB on every `auth()` call so the UI reflects changes immediately without a sign-out/sign-in cycle.
5. **Issuer provisioning** — registration creates only an account. Issuer setup (company details + P12 cert) happens in Settings and calls `POST /api/admin/issuers` via `src/lib/admin-api.ts` using `COMPROBIFY_ADMIN_SECRET`.
6. **Sandbox → production** — one-way promotion via `POST /api/admin/issuers/:id/promote` + new production API key. The `environment` column flips from `'sandbox'` to `'production'`.

The BFF pattern (ADR-002) is unchanged — only the source of the API key changed (DB instead of env var).

## Consequences of Phase 2

- `COMPROBIFY_API_KEY` and `COMPROBIFY_SANDBOX` env vars are removed — replaced by per-user DB state
- `DATABASE_URL`, `COMPROBIFY_ADMIN_SECRET`, and `AUTH_SECRET` are now required env vars
- Every server-side API call must call `requireApiKey()` to get the current user's key
- One DB query per `auth()` call (for `environment` and `hasIssuer`) — acceptable for this traffic level
