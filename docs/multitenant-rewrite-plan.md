# Multi-Tenant RBAC Rewrite — `comprobify-web`

> Single source of truth for the rewrite. Reflects API repo state at commit `b3360bb` (ADR-014, tenant-level environment + promotion).

---

## 1. ✅ Context

The Comprobify API has shipped two breaking changes that the frontend does not yet model:

- **ADR-013** (already in `main`): API keys are **tenant-scoped**, not issuer-scoped. Every authenticated call must carry `Authorization: Bearer <tenant-api-key>` **and** `X-Issuer-Id: <issuer-id>`.
- **ADR-014** (commit `b3360bb`): **Environment (sandbox/production) lives on `Tenant`, not on `Issuer`.** A tenant maps to one RUC, so promotion is a single tenant-level action. On promote, all sandbox API keys are revoked and re-minted as production keys (same count, same labels). `POST /api/issuers/:id/promote` is **removed**; use `POST /api/tenants/promote`. `initialSequentials` now takes `[{issuerId, documentType, sequential}]`.

The current frontend treats `User` as a de-facto tenant and embeds the API key on `User` (or, in the in-flight uncommitted work, on `Issuer` — still wrong). Decision: **revert the in-flight work and start clean from `main` HEAD**.

End-state: humans (`User`) log in. **A user belongs to exactly one `Tenant`** (`User.tenantId` non-null after onboarding, role stored directly on `User`). Roles map to permissions checked at every Server Action and gated Server Component. The active operating context (`issuerId`) lives in a signed, httpOnly cookie set by a Server Action and resolved on every request by `requireContext()` — tenant is derived from the logged-in user, not selected. Tenant API keys live **encrypted** in a dedicated `TenantApiKey` table; the active environment lives on `Tenant`, so we never need to pick a key by environment — just pick the one active key. `Product` and `Client` move from `User` to `Tenant` scope so colleagues sharing a tenant share catalogs.

DB is wiped (no production users to migrate) → ship one fresh `init_multitenant` migration.

---

## 2. ✅ Data model

Single fresh migration. Full `prisma/schema.prisma` replacement:

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String?   @map("password_hash")          // null while INVITED, set on registration
  emailVerified Boolean   @default(false) @map("email_verified")
  tenantId      Int?      @map("tenant_id")              // null only before onboarding
  role          String?                                  // Owner | Admin | BillingOperator | Viewer | Developer
  inviteStatus  String    @default("ACTIVE") @map("invite_status")  // ACTIVE | INVITED | DISABLED
  invitedAt     DateTime? @map("invited_at")
  acceptedAt    DateTime? @map("accepted_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  tenant        Tenant?   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  issuerAccess  UserIssuerAccess[]

  @@index([tenantId, role])
  @@map("users")
}

model Tenant {
  id            Int            @id @default(autoincrement())
  apiTenantId   Int            @unique @map("api_tenant_id")      // Comprobify API tenant id
  ruc           String         @unique @db.VarChar(13)
  businessName  String         @map("business_name")
  tradeName     String?        @map("trade_name")
  environment   String         @default("sandbox")                // "sandbox" | "production" (per ADR-014)
  status        String         @default("ACTIVE")                 // mirror of API status
  tier          String?
  contactEmail  String?        @map("contact_email")
  createdAt     DateTime       @default(now()) @map("created_at")
  apiKeys       TenantApiKey[]
  issuers       Issuer[]
  users         User[]
  issuerAccess  UserIssuerAccess[]
  products      Product[]
  clients       Client[]

  @@map("tenants")
}

model TenantApiKey {
  id           Int       @id @default(autoincrement())
  tenantId     Int       @map("tenant_id")
  apiKeyId     Int       @unique @map("api_key_id")              // Comprobify API api_keys.id (for revoke calls)
  label        String
  environment  String                                            // matches the tenant's environment at creation
  encryptedKey String    @map("encrypted_key")                   // v1:b64(iv):b64(ct):b64(tag)
  lastFour     String    @map("last_four") @db.VarChar(4)
  isActive     Boolean   @default(true) @map("is_active")
  createdAt    DateTime  @default(now()) @map("created_at")
  revokedAt    DateTime? @map("revoked_at")
  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, isActive])
  @@map("tenant_api_keys")
}

model Issuer {
  id             Int      @id @default(autoincrement())
  tenantId       Int      @map("tenant_id")
  apiIssuerId    Int      @unique @map("api_issuer_id")
  branchCode     String   @map("branch_code") @db.VarChar(3)
  issuePointCode String   @map("issue_point_code") @db.VarChar(3)
  businessName   String   @map("business_name")
  tradeName      String?  @map("trade_name")
  branchAddress  String?  @map("branch_address")
  isDefault      Boolean  @default(false) @map("is_default")
  createdAt      DateTime @default(now()) @map("created_at")
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  access         UserIssuerAccess[]

  @@unique([tenantId, branchCode, issuePointCode])
  @@index([tenantId])
  @@map("issuers")
}

model UserIssuerAccess {
  id       Int    @id @default(autoincrement())
  userId   Int    @map("user_id")
  tenantId Int    @map("tenant_id")
  issuerId Int    @map("issuer_id")
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  issuer   Issuer @relation(fields: [issuerId], references: [id], onDelete: Cascade)

  @@unique([userId, issuerId])
  @@index([userId, tenantId])
  @@map("user_issuer_access")
}

model Product {
  id          Int      @id @default(autoincrement())
  tenantId    Int      @map("tenant_id")
  mainCode    String   @map("main_code") @db.VarChar(25)
  auxCode     String?  @map("aux_code") @db.VarChar(25)
  description String
  unitPrice   Decimal  @map("unit_price") @db.Decimal(14, 6)
  taxOption   String   @map("tax_option") @db.VarChar(10)
  createdAt   DateTime @default(now()) @map("created_at")
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("products")
}

model Client {
  id        Int      @id @default(autoincrement())
  tenantId  Int      @map("tenant_id")
  idType    String   @map("id_type") @db.VarChar(5)
  idNumber  String   @map("id_number") @db.VarChar(20)
  name      String
  email     String
  address   String?
  createdAt DateTime @default(now()) @map("created_at")
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("clients")
}
```

**Notes**:
- `Issuer.environment` field is **removed** — environment is now a property of the Tenant (ADR-014).
- `Tenant.environment` flips from `'sandbox'` → `'production'` exactly once via `promoteTenantAction` (calls `POST /api/tenants/promote`).
- `TenantApiKey.environment` still recorded for audit/display, but it always equals `tenant.environment` at the time of creation. On promote, all rows with `environment='sandbox'` get `isActive=false` and we insert new rows with `environment='production'` from the API response.
- `Product` / `Client` are tenant-scoped (catalogs are an org concern).
- `UserIssuerAccess` semantics: empty rows → access to all issuers; ≥1 row → whitelist. Owners/Admins always see all issuers regardless (enforced in `requireContext`).
- **Why no `Membership` table**: one tenant per user → no need for a join table. `tenantId` + `role` + `inviteStatus` live directly on `User`.

---

## 3. ✅ Roles and permissions

Hardcoded TypeScript map. Permissions are part of the security contract — code review is the right place to change them. Migrate to DB-backed later if/when we need custom roles.

File: `src/lib/rbac.ts`

```ts
export type Role = 'Owner' | 'Admin' | 'BillingOperator' | 'Viewer' | 'Developer';

export type Permission =
  | 'documents.create' | 'documents.read' | 'documents.manage'   // resend, rebuild, retry email
  | 'clients.manage'   | 'catalog.manage'
  | 'issuers.read'     | 'issuers.manage'                        // create branch, edit doc types
  | 'tenant.promote'                                             // sandbox -> production (one-shot)
  | 'apikeys.read'     | 'apikeys.manage'
  | 'users.read'       | 'users.manage'                          // invite, change role, remove
  | 'billing.read'
  | 'tenant.manage';                                             // rename, change contact

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  Owner:           new Set([/* all */]),
  Admin:           new Set([/* all except tenant.manage and tenant.promote */]),
  BillingOperator: new Set(['documents.create','documents.read','documents.manage','clients.manage','catalog.manage','issuers.read']),
  Viewer:          new Set(['documents.read','issuers.read']),
  Developer:       new Set(['documents.read','apikeys.read','apikeys.manage','issuers.read']),
};

export function hasPermission(role: Role, code: Permission): boolean { ... }
```

Decision: `tenant.promote` is **Owner-only**. Promotion is irreversible and clears all sandbox keys — too destructive to delegate to Admin. Can be opened up later with a one-line change to `ROLE_PERMISSIONS`.

---

## 4. ✅ Auth + Context flow

**Login** (`src/app/actions/auth.ts::loginAction`):
1. Verify credentials.
   - If `user.inviteStatus === 'INVITED'` and `passwordHash` is null → redirect to a "complete registration" flow that sets the password and flips status to `'ACTIVE'`.
2. Branch on user state:
   - `tenantId === null` → `/onboarding/tenant` (first user creating their org).
   - `tenantId` set, exactly one accessible issuer → auto-set issuer cookie → `/dashboard`.
   - `tenantId` set, >1 issuers → `/issuer/select`.
   - `tenantId` set, 0 issuers (orphan tenant — Owner/Admin only path) → `/issuers?empty=true`.

**Session JWT trimmed to minimum**:

```ts
declare module 'next-auth' {
  interface Session { user: { id: string; email: string } }
}
```

Drop `environment`, `hasIssuer`, `isEmailVerified` from session — they become DB-reads inside `requireContext()`.

**`src/lib/context.ts`** (rename of `src/lib/auth-token.ts`):

```ts
import 'server-only';

export interface Context {
  user:        { id: number; email: string; emailVerified: boolean; role: Role };
  tenant:      { id: number; apiTenantId: number; ruc: string; businessName: string; tradeName: string|null; status: string; environment: 'sandbox'|'production' };
  permissions: ReadonlySet<Permission>;
  issuer:      { id: number; apiIssuerId: number; branchCode: string; issuePointCode: string; businessName: string; tradeName: string|null };
  apiKey:      string;   // decrypted, server-only
}
export interface MinimalContext { user; tenant; permissions; apiKey; }

export async function requireContext(opts?: { skipIssuer?: boolean }): Promise<Context | MinimalContext>;
export async function requirePermission(code: Permission, opts?: { skipIssuer?: boolean }): Promise<Context | MinimalContext>;
export async function hasContextPermission(code: Permission): Promise<boolean>;
```

Resolution order in `requireContext()`:
1. `auth()` → else redirect `/login`.
2. Load `User` (with `tenant` relation).
   - `tenantId === null` → redirect `/onboarding/tenant`.
   - `inviteStatus !== 'ACTIVE'` → redirect to complete-registration.
   - `role === null` → treat as invalid → redirect `/login`.
3. If `opts.skipIssuer`: pick the active `TenantApiKey` (any `isActive=true` row — tenant has one environment so there's no ambiguity). Return `MinimalContext`. Used by `/issuer/select`, `/issuers`, `/api-keys`, `/users`, `/settings`.
4. Read+verify `comprobify_ctx` cookie. Missing issuerId → if exactly one accessible issuer, set the cookie and continue; else redirect `/issuer/select`.
5. Load Issuer, verify `issuer.tenantId === user.tenantId` and (if role ∉ {Owner, Admin} and any `UserIssuerAccess` rows exist for this user) is permitted. Else clear issuer cookie + `/issuer/select`.
6. Resolve active `TenantApiKey` (`tenantId, isActive=true`). Missing → redirect `/api-keys?missing=1` (with a flash). Decrypt and return.

`requirePermission(code)` = `requireContext` + throws/redirects if permission absent. Server Actions catch and return `{ error: 'FORBIDDEN' }`.

`hasContextPermission(code)` — non-throwing check for conditionally rendering Server Components.

---

## 5. API client refactor

`src/lib/api.ts` — every function's first arg changes from `apiKey: string` to:

```ts
export interface ApiCtx { apiKey: string; issuerId?: number }
```

Shared `request()` helper adds `X-Issuer-Id: <issuerId>` only when `issuerId` is set.

### Existing functions — change signature only

`listDocuments`, `getDocument`, `createDocument`, `sendToSri`, `checkAuthorization`, `rebuildDocument`, `getDocumentEvents`, `retrySingleEmail`, `listCatalogIdTypes`, `listCatalogPaymentMethods`, `listCatalogTaxRates`, `listDocumentTypes` → all take `ApiCtx` (with `issuerId`).

### New tenant-level functions (no `X-Issuer-Id` header)

- `listTenantIssuers(ctx: ApiCtx)` → `GET /api/issuers`
- `createIssuer(ctx: ApiCtx, fields, p12?, password?)` → `POST /api/issuers` (multipart; cert optional if copying from existing branch)
- `addIssuerDocumentType(ctx, issuerId, code)` → `POST /api/issuers/:id/document-types`
- `removeIssuerDocumentType(ctx, issuerId, code)` → `DELETE /api/issuers/:id/document-types/:code`
- `listIssuerDocumentTypes(ctx, issuerId)` → `GET /api/issuers/:id/document-types`
- **`promoteTenant(ctx: ApiCtx, initialSequentials?: Array<{issuerId, documentType, sequential}>)`** → `POST /api/tenants/promote` *(ADR-014)*. Response: `{ ok: true, apiKeys: [{ id, label, environment: 'production', key }] }`. **Caller must persist these new keys** and revoke local sandbox `TenantApiKey` rows (`isActive=false`, `revokedAt=now`).
- `listTenantApiKeys(ctx)` → `GET /api/keys`
- `createTenantApiKey(ctx, label)` → `POST /api/keys`. The API mints with the tenant's current environment; the response carries the cleartext key once.
- `revokeTenantApiKey(ctx, id)` → `DELETE /api/keys/:id`

### Removed functions

- ~~`promoteIssuer` / `POST /api/issuers/:id/promote`~~ — removed in ADR-014.
- ~~`registerIssuer` from `src/lib/api.ts`~~ — moves to `src/lib/public-api.ts`.

### New module: `src/lib/public-api.ts` (unauthenticated calls)

- `registerTenant({ email, fields, p12, password, redirectUrl? })` → `POST /api/register`. Returns `{ tenant, issuer, apiKey, isEmailVerified }`.
- `verifyEmailToken(token)` → `GET /api/verify-email`.
- `resendVerificationEmail(email, redirectUrl?)` → `POST /api/resend-verification`.

Separating public/auth calls prevents accidental misuse from authenticated paths.

### Deleted

- `src/lib/admin-api.ts` — super-admin tooling is out of scope for the tenant UI.

---

## 6. Screens and Server Actions

### Existing screens (refactor)

| Route | Notes |
|---|---|
| `/login` | Same shell. `loginAction` branches per §4. |
| `/register` | Same shell; pure user registration (no tenant). |
| `/verify-email` | Same; uses `public-api.ts`. |
| `/dashboard` | `requireContext()`; show tenant trade name + selected issuer + KPIs. |
| `/documents`, `/documents/[type]` | `requirePermission('documents.read')`. |
| `/invoices/new`, `/invoices/[key]` | `requirePermission('documents.create')` / `documents.manage`. |
| `/clients`, `/catalog` | Read with `documents.read`; write with `clients.manage` / `catalog.manage`. Scope by `tenantId`. |
| `/settings` | Renamed conceptually to **tenant settings** — tradeName, contact email, language preference, tier display. Hosts the "Promote to production" button (gated by `tenant.promote`). |

### NEW screens

- **`/onboarding/tenant`** — first-time setup (P12 upload, RUC, business name, branch/issuepoint, branch address). Action `bootstrapTenantAction(formData)`:
  1. Calls `registerTenant()`.
  2. Single `db.$transaction`: insert `Tenant(environment='sandbox')` + `TenantApiKey(encrypted, environment='sandbox')` + `Issuer` + update current `User` with `tenantId` and `role='Owner'`.
  3. Sets the `comprobify_ctx` cookie with the new issuer id.
  4. Redirects to `/dashboard` (or `/verify-email` if `isEmailVerified=false`).

- **`/issuer/select`** — list accessible issuers (`Owner`/`Admin` see all; others filtered via `UserIssuerAccess`). Action `selectIssuerAction(issuerId)`.

- **`/issuers`** — list/create branch/manage document types. Gated `issuers.read` / `issuers.manage`. Actions: `createBranchAction(formData)`, `addDocumentTypeAction(issuerId, code)`, `removeDocumentTypeAction(issuerId, code)`. **No per-issuer promote** anymore (ADR-014).

- **`/api-keys`** — list/create/revoke. Cleartext key shown **once** at creation (modal). Banner warns if tenant has zero active keys. Gated `apikeys.read` / `apikeys.manage`. Display the tenant's environment alongside each key so users know what environment they're hitting.

- **`/users`** — list/invite/role/remove + per-user issuer access. Gated `users.read` / `users.manage`. Invite flow: admin enters email + role; we create a `User` row with `inviteStatus='INVITED'`, null `passwordHash`, `tenantId=ctx.tenant.id`. The invitee registers with that email; we look up the existing row, set the password, flip status to `'ACTIVE'`.

### Promotion flow (sandbox → production)

Lives on the **tenant settings page** (or a dedicated `/settings/promote` route). Gated by `tenant.promote` (Owner only).

`promoteTenantAction(initialSequentials?)`:
1. Confirms via a modal (this is irreversible).
2. Calls `promoteTenant(ctx, initialSequentials)`.
3. In a `db.$transaction`:
   - Mark all existing `TenantApiKey` rows as `isActive=false, revokedAt=now()`.
   - Insert the new production keys from the API response (encrypted; preserve `apiKeyId`, `label`, `environment='production'`, `lastFour`).
   - Update `Tenant.environment = 'production'`.
4. The next `requireContext()` call resolves the new production key automatically.
5. UI shows "Promoted to production" toast.

### `src/app/actions/` final shape

- `auth.ts` — `loginAction`, `registerAction`, `logoutAction` (clears ctx cookie + session).
- `context.ts` — `selectIssuerAction`, `clearContextAction`.
- `onboarding.ts` — `bootstrapTenantAction`.
- `issuers.ts` — `createBranchAction`, `addDocumentTypeAction`, `removeDocumentTypeAction`.
- `tenant.ts` — `updateTenantAction` (tradeName, contactEmail, language), `promoteTenantAction`.
- `apiKeys.ts` — `createTenantApiKeyAction`, `revokeTenantApiKeyAction`.
- `users.ts` — `inviteUserAction`, `updateUserRoleAction`, `removeUserAction`, `setUserIssuerAccessAction`.
- `document.ts`, `invoice.ts`, `clients.ts`, `catalog.ts` — refactored to `requireContext()` + `ApiCtx`.

---

## 7. Operational context cookie

Single signed cookie. Tenant is implicit (from `user.tenantId`), so the cookie carries only the issuer selection.

- **Name**: `comprobify_ctx`
- **Value**: `<base64url(JSON)>.<hmac-sha256>`; payload `{ issuerId: number, v: 1 }`
- **Signing key**: env `CONTEXT_COOKIE_SECRET`
- **Attrs**: `httpOnly`, `secure` in prod, `sameSite='lax'`, `path='/'`, 30d max-age (revalidated against DB every request anyway)
- **Helper**: `src/lib/context-cookie.ts` exposing `readCtxCookie()`, `writeCtxCookie(payload)`, `clearCtxCookie()`
- **Lifecycle**: set by `selectIssuerAction` and `bootstrapTenantAction`; cleared by `clearContextAction` and on signOut. Tampered/invalid signature → treat as missing.

---

## 8. Nav UX (mobile-aware)

`src/components/nav.tsx` decomposes into:

- **`TenantBadge`** — read-only display: tenant trade name + environment chip (`sandbox`/`production`). No switcher (one tenant per user).
- **`IssuerSwitcher`** (client) — Base UI dropdown. Renders as non-interactive text when ≤1 issuer accessible. On change, submits a `<form>` calling `selectIssuerAction` then `router.refresh()`.
- **`UserMenu`** — avatar/email, locale, theme, sign out.

Desktop sidebar: tenant + issuer header block above nav links. Mobile top bar: `[≡] [Logo] [Sucursal ▼]` with user menu inside the drawer. Per CLAUDE.md rule 11, wrap every `<Table>` in `<div className="overflow-x-auto">`.

Hide operational nav entries (documents/clients/catalog/invoices) when there are zero accessible issuers — driven by `requireContext({skipIssuer:true})` + `tenant.issuers.length > 0`.

---

## 9. API key encryption at rest

New module `src/lib/crypto.ts`:

- Env var `ENCRYPTION_KEY` = 32-byte hex (`openssl rand -hex 32`). Throw on startup if missing.
- AES-256-GCM, random 12-byte IV per encryption.
- Stored format `v1:b64(iv):b64(ct):b64(tag)` (versioned for future rotation).
- Public surface:

  ```ts
  export function encrypt(plain: string): string;
  export function decrypt(stored: string): string;
  export function lastFour(plain: string): string;
  ```

- Decrypt only inside `requireContext()` and at write time in `bootstrapTenantAction` / `createTenantApiKeyAction` / `promoteTenantAction`. Never inside React components.

---

## 10. Phased rollout

Each phase independently mergeable. Each phase ends with a working build (even if some screens 404 with a clear "coming next phase" message).

1. ✅ **Schema + helpers, no UI**
   - ✅ Revert the in-flight uncommitted work (§11).
   - ✅ Replace `prisma/schema.prisma` per §2; drop all migrations under `prisma/migrations/`; create one fresh `init_multitenant` migration.
   - ✅ Add `src/lib/crypto.ts`, `src/lib/rbac.ts`, `src/lib/context-cookie.ts`.
   - ✅ Stub `src/lib/context.ts` with `NOT_IMPLEMENTED` throws so callers compile.

2. **Auth wiring + onboarding**
   - Trim `src/auth.ts` session shape to `{ id, email }`.
   - Implement `requireContext()` for real.
   - Create `src/lib/public-api.ts`; implement `bootstrapTenantAction`.
   - Build `/onboarding/tenant` screen.
   - Add `loginAction` branching logic per §4.

3. **API client refactor**
   - `request()` takes `ApiCtx`; update all existing call sites.
   - Add new tenant-level functions (including `promoteTenant`, NOT `promoteIssuer`).
   - Refactor `document.ts`, `invoice.ts`, `clients.ts`, `catalog.ts`, `tenant.ts` actions to use `requireContext()` + `ApiCtx`.
   - Refactor existing screens (`/dashboard`, `/invoices/*`, `/documents/*`, `/clients`, `/catalog`, `/settings`).
   - Delete `src/lib/admin-api.ts`.

4. **Context UI**
   - `/issuer/select` page + `selectIssuerAction`.
   - Refactor `nav.tsx` (`TenantBadge`, `IssuerSwitcher`, `UserMenu`).
   - `LocaleLayout` uses `requireContext({skipIssuer:true}).catch(null)` to render the authenticated shell.

5. **Issuers admin**
   - `/issuers` list/create-branch screen.
   - `/issuers/[id]` document-types screen.
   - Gated by `issuers.*` permissions.

6. **API keys admin + promotion**
   - `/api-keys` list/create/revoke with one-time cleartext modal.
   - Missing-key banner.
   - `promoteTenantAction` + UI in `/settings` (Owner-only).
   - `scripts/rotate-encryption-key.ts` helper.

7. **Users / RBAC UI**
   - `/users` invite/role/remove/issuer-access UI.
   - Audit pass: every Server Action calls `requirePermission`; every privileged Server Component branch hides UI with `hasContextPermission`.
   - Localization sweep: add all new keys to `messages/es.json` + `messages/en.json`.
   - Mobile QA pass.

---

## 11. Files to revert (before Phase 1)

From `/Users/jonand/Coding/Projects/comprobify-web`:

```bash
git checkout -- \
  prisma/schema.prisma \
  src/app/[locale]/dashboard/page.tsx \
  src/app/[locale]/documents/[type]/page.tsx \
  src/app/[locale]/documents/page.tsx \
  src/app/[locale]/invoices/[key]/page.tsx \
  src/app/[locale]/invoices/new/page.tsx \
  src/app/[locale]/settings/page.tsx \
  src/app/actions/document.ts \
  src/app/actions/invoice.ts \
  src/app/actions/settings.ts \
  src/app/api/documents/[key]/status/route.ts \
  src/auth.ts \
  src/lib/api.ts \
  src/lib/auth-token.ts

rm -rf prisma/migrations/20260511110227_extract_issuer_table
```

User to confirm before running. Phase 1 then *also* deletes the older migrations (`20260428122337_init`, `20260430123106_add_email_verified`, `20260511011747_add_products_table`, `20260511020546_add_clients_table`) since we're doing one fresh migration on a wiped DB.

---

## 12. Critical files to modify

- `prisma/schema.prisma` — full replacement per §2.
- `prisma/migrations/<fresh>/migration.sql` — one new migration.
- `src/auth.ts` — trim session shape.
- `src/lib/auth-token.ts` → rename to `src/lib/context.ts`.
- `src/lib/api.ts` — `ApiCtx` refactor + new tenant endpoints + `promoteTenant`.
- `src/lib/admin-api.ts` — delete.
- `src/lib/public-api.ts` (new) — unauthenticated calls (`registerTenant`, `verifyEmailToken`, `resendVerificationEmail`).
- `src/lib/rbac.ts` (new).
- `src/lib/crypto.ts` (new).
- `src/lib/context-cookie.ts` (new).
- `src/components/nav.tsx` — TenantBadge + IssuerSwitcher.
- `src/app/actions/*` — restructured per §6.
- All `src/app/[locale]/**/page.tsx` — refactor to `requireContext()`.
- `messages/es.json`, `messages/en.json` — new keys per phase.
- `.example.env` — add `ENCRYPTION_KEY`, `CONTEXT_COOKIE_SECRET`.

---

## 13. Verification

After each phase:

- `npm run build` + `npm run type-check` clean.
- Manual e2e from Phase 2: register → bootstrap tenant → see dashboard.
- Phase 3: create an invoice end-to-end against sandbox; verify the API log shows incoming `Authorization` + `X-Issuer-Id` headers on every authenticated request.
- Phase 4: with two issuers seeded, switching in the nav updates the displayed issuer everywhere after `router.refresh()`.
- Phase 5: create a second branch from `/issuers`; verify the `IssuerSwitcher` now lists it.
- Phase 6:
  - Create + revoke a sandbox API key; cleartext shown once only.
  - Trigger `promoteTenantAction` against a verified-email sandbox tenant. Confirm: `Tenant.environment` flips to `production`, old sandbox `TenantApiKey` rows are inactive, new production rows exist with matching labels, next request to documents endpoints succeeds with the new key.
- Phase 7:
  - Invite a `BillingOperator` and a `Viewer`. Verify gating: BillingOperator can create invoices but not access `/users` or `/api-keys`; Viewer is read-only.
  - Assign a `Viewer` to a single issuer via `UserIssuerAccess`; verify `/issuer/select` shows only that one.
- Mobile pass (Chrome DevTools 375px width) on every new screen.

---

## 14. Risks and open questions

1. **`ENCRYPTION_KEY` management** — losing it bricks all stored tenant keys (recoverable only by re-minting via the API). Recommendation: keep in 1Password + `.env`; prefix stored values with `v1:` (versioning) so we can rotate. Phase 6 ships `scripts/rotate-encryption-key.ts`.

2. **`POST /api/register` response shape** — `bootstrapTenantAction` assumes `{ tenant: { id, ruc, status, environment, ... }, issuer: { id, branchCode, issuePointCode, businessName, branchAddress }, apiKey: { id, label, environment, key }, isEmailVerified }`. Verify against the live API before Phase 2. If `apiKey` is returned as a bare string we need to also `GET /api/keys` to capture its `id` and `label` (we store both for later revocation/rotation).

3. **`promoteTenant` response shape** — assumes `{ ok: true, apiKeys: [{ id, label, environment: 'production', key }] }`. If `key` (cleartext) is returned only at promote-time, we MUST persist and encrypt it in the same transaction; there is no way to retrieve it again. Confirm the field names against `src/services/tenant.service.js` in the API repo before Phase 6.

4. **Pre-promote validation** — the API requires `tenant.status === 'ACTIVE'` (email verified). UI must surface this requirement and disable the promote button when `tenant.status !== 'ACTIVE'`.

5. **Viewer / non-admin issuer switching** — non-Owner/Admin roles can switch among issuers in `UserIssuerAccess`. Owner/Admin always see all issuers (ignores the table). Acceptable for v1?

6. **`Admin` permission to promote** — resolved: Owner-only. See section 3.

7. **TanStack Query polling and issuer change** — include `issuerId` in every `queryKey` so issuer switching naturally invalidates polling queries; switcher calls `router.refresh()` after the action so server-rendered cached pages re-fetch.

8. **Invite mechanism** — MVP uses email-match (pre-create `User` row with `inviteStatus='INVITED'`, activate on invitee's next login). Future: signed URL token if we want email changes.

9. **`Tenant.environment` cache freshness** — we store this locally for UI, but the API is the source of truth. After a promote, both records flip in the same transaction. Should there be a "refresh tenant from API" action in `/settings` to handle drift? Probably yes for v1.5; not necessary for v1.

10. **Document types per issuer after promote** — confirm with the API repo whether enabled document types persist across the sandbox→production promote, or whether we need to re-enable them. (ADR-014 says keys are mirrored; doesn't explicitly mention document types.)
