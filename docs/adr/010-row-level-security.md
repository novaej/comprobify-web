# ADR-010: Fail-Closed Row-Level Security on Tenant-Owned Tables

**Status:** Accepted
**Date:** 2026-10-08

## Context

Tenant isolation in this app's own database was enforced only in application code: every query on a tenant-owned table had to remember its `tenantId` filter. One forgotten filter exposes another tenant's clients, products or API-key records. `docs/deployment-reference-staging.md` and `docs/guides/database-backups.md` both stated this explicitly.

Two sibling projects already faced the same problem. `taxap` (same Prisma stack) uses a transaction-local setting read by policies. Its first version treated an *unset* variable as "allow everything", which made a forgotten wrapper indistinguishable from a deliberate admin call; it was fixed to fail closed. The Comprobify API is making the same move (`comprobify/docs/plans/rls-fail-closed.md`). This ADR applies the fail-closed version here.

## Decision

**Fail-closed RLS on the tables that carry tenant data, keyed by tenant.**

- **Context key: the tenant.** `requireContext()` loads the `User` by session id first and only then learns the tenant, and everything per-user (RBAC in `rbac.ts`, `UserIssuerAccess`, notification visibility) operates *inside* one tenant. A per-user key would add no isolation, so there is no user variable.
- **Mechanism.** `app.current_tenant_id` is set with `set_config(name, value, true)` (transaction-local, bound parameter) inside an interactive Prisma transaction. Never session-level: Prisma pools connections, so a session variable would leak to the next request. Two wrappers in `src/lib/db.ts`: `withTenant(tenantId, fn)` and `asSystem(reason, fn)`. `asSystem` sets `app.rls_system = 'on'` (exactly that value) and records the mandatory reason in `app.rls_reason`.
- **Fail closed.** A query with no context sees zero rows and cannot insert (`42501`). An unset, empty or malformed variable never widens access. There is no `IS NULL OR` branch in any policy.
- **`ENABLE` and `FORCE`** on every protected table: the app role owns the tables and runs `prisma migrate deploy`, and without `FORCE` Postgres exempts the owner from its own policies. Every policy is `FOR ALL` with an explicit `WITH CHECK`, so a tenant cannot insert or move a row into another tenant.
- **Compile-time enforcement.** The exported `db` is typed to expose only the unprotected models, so an unwrapped query on a protected table is a `tsc` error. A relation load that crosses from an unprotected parent into a protected child (for example `user.findMany({ include: { issuerAccess } })`) is *not* caught by the compiler and silently returns nothing outside a wrapper; the integration test pins this behaviour.

### Scope

Protected (policy on `tenant_id`): `tenant_api_keys`, `issuers`, `user_issuer_access`, `products`, `clients`, `document_templates`, `notifications`, `webhook_endpoints`. `notification_reads` has no tenant column and follows its parent notification.

Deliberately **not** protected (reasons in `prisma/rls-tables.json`, enforced by a catalog test):

| Table | Why |
|---|---|
| `tenants` | The tenant's own row; read before any context exists (login, session bootstrap, webhook tenant lookup, admin list). |
| `users` | Identity table. Login, registration, reset, invite and session bootstrap all happen before a tenant is known. |
| `verification_tokens` | SHA-256 hashes only, reached by possessing the token, every flow pre-tenant. |
| `agreement_drafts` | Global, super-admin only, unpublished legal text. |

This mirrors the API, which leaves its identity and global tables outside RLS. **Residual risk, accepted:** a forgotten `tenantId` filter on `users` or `tenants` is not caught by the database. Those queries are few and all scope by tenant today; protecting them is a possible follow-up.

### Paths with no tenant

Only three places use `asSystem`: the onboarding transaction (creates the tenant, its first key and issuer), the recovery auto-link transaction, and `scripts/rotate-encryption-key.js`. Everything else either has a tenant id in hand or touches only unprotected tables. The webhook receiver resolves the tenant on the unprotected `tenants` table, verifies the HMAC, then writes under `withTenant`. `docs/plans/rls-call-sites.md` lists every converted call.

### Operations

- The connecting role must not be a superuser and must not have `BYPASSRLS` (both bypass every policy silently). `scripts/check-db-role.js` runs in `start:deploy` after `prisma migrate deploy` and refuses to start otherwise; `RLS_GUARD=warn` logs and continues (emergency escape hatch only).
- **Data migrations** that write a protected table must first run `SELECT set_config('app.rls_system', 'on', false);`, or they update zero rows and report success.
- `pg_dump` must run as `doadmin`, not the app role (see `docs/guides/database-backups.md`).
- Rollback: `prisma/rollback/add_row_level_security_down.sql`. It only swaps policies, loses no data, and the application code works with or without RLS.

## Consequences

- Every query on a protected table runs in a short transaction (extra `BEGIN`/`set_config`/`COMMIT` round trips). A wrapper holds a pooled connection for its whole duration, so keep callbacks short and never nest wrappers; the one callback that spans external API calls is the per-role key mint, which keeps its 15s timeout.
- The single app role still owns the tables, so it could run `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`. RLS here defends against a forgotten filter, not against an attacker with DDL rights. Splitting a migrator role from a non-owning runtime role would close that and is a possible follow-up.
- Postgres limits: unique indexes and foreign-key checks ignore RLS, so a duplicate `ruc` or `email` raises a unique violation across tenants (a small existence oracle, unchanged from before), and a foreign key can reference another tenant's row id; the app validates ids before linking.
- `tests/integration/rls-fail-closed.test.ts` runs against a real Postgres as a non-superuser and must pass before production.
