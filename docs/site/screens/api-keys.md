# API Keys Screen

**Route:** `/es/settings/api-keys`  
**Component:** `src/app/[locale]/settings/api-keys/page.tsx`  
**Type:** Server Component + Client Component (`ApiKeyManager`)  
**Permission:** `apikeys.read` (view) / `apikeys.manage` (create, revoke) — Owner, Admin, Developer

Moved here from the former top-level `/api-keys` route; content-width-wise it stays in the fluid list/table cluster (not `max-w-3xl`) despite living under `/settings`, since its main content is a table — see CLAUDE.md → "Page content width".

---

## Purpose

Self-service Comprobify API key management for Postman, an ERP, or any direct integration outside this web app. Also shows, per key, its granted scopes, lifetime usage totals, and a daily request-volume chart, so an Owner/Admin/Developer can tell which integrations are actually active before revoking a key.

This screen also displays — read-only, not creatable/editable here — the "managed" keys the app mints for itself: the tenant's full-access **master key** (used by Owner/Admin), and a narrower key per role (BillingOperator/Viewer/Developer) scoped to what that role can do. See CLAUDE.md → "Per-role API key scopes" for the minting architecture; this doc covers only what's visible/actionable on the screen.

---

## Sections

### Missing-key warning

Shown when the tenant has zero active keys (`missingKey` prop) — the app itself can't authenticate any request until one exists. `requireContext()` redirects here with `?missing=1` when it can't resolve an active `TenantApiKey` row for the signed-in user's role (see `src/lib/context.ts` → `resolveApiKeyForRole()`).

### Usage counter and tier limit

A persistent "X of Y API keys used" line (or "(ilimitado)"/"(unlimited)" for `maxApiKeys === null`) sits above the create form, sourced from `listTenantApiKeys()`'s own `limit: { max, used }` — a plain passthrough of the tier's `maxApiKeys` as of comprobify migration 102 (comprobify-web's own reserved master/per-role keys are excluded from this pool entirely, not padded headroom on top of it — see CLAUDE.md Common Mistake #65). If `max === 0` (the plan includes no self-service keys at all), the counter is hidden in favor of a `noCustomAccess` banner instead; if `used >= max`, a `keyLimitReached` banner appears alongside the counter and the create-key trigger disables.

### Create form

A `label` field (defaults to `"default"` if left blank) plus a scope checklist. The checklist only offers the scopes the *caller's own* resolved key holds (`computeApiScopesForRole(ctx.user.role)`, passed down as `callerScopes`) — all checked by default, at least one required. On submit → `createTenantApiKeyAction(label, scopes)`:
1. `POST /v1/keys` with `environment` sent **explicitly** as `ctx.tenant.environment` (the API defaults to `'sandbox'` if omitted, which would mint a key that 401s with `API_KEY_ENV_MISMATCH` on a promoted tenant) and `scopes` as the checked set. The API rejects (`SCOPE_ESCALATION_FORBIDDEN`) any scope the authenticating key doesn't itself have — since the checklist is already bounded to `callerScopes`, this can't be triggered through the UI.
2. The plaintext token is shown once (copy-once display, `showKey` toggle) and never persisted in cleartext — only its AES-256-GCM-encrypted form, last four digits, and the granted `scopes` are stored in `TenantApiKey`.

There is no scope-editing UI for an existing key — scopes are immutable per key at the API once created.

### Key table

One row per `TenantApiKey`, columns:
- Label (+ "En uso por la app" / "En uso por la app ({role})" badge, on its own line below the label, for any `isManaged` row — the master key or a per-role key; revoke button disabled for that row, both in the UI and re-checked server-side in `revokeTenantApiKeyAction`)
- Scopes — a single "Acceso total" badge if the key holds all 11 scopes, otherwise one small pill per scope; an em dash for a legacy key with no locally-recorded scopes
- Environment
- Last four digits
- Status (active/revoked)
- Created date
- **Last used** — lifetime `lastUsedAt`, or "Nunca"/"Never" if the key has never authenticated a request
- **Requests** — lifetime `requestCount`, not windowed
- "Ver uso" toggle — expands the usage chart inline below the row
- Revoke button (`apikeys.manage` only; disabled for revoked keys and any `isManaged` key) — clicking opens an in-app confirmation `Dialog` (label + last four shown), not the browser's native `confirm()`

`lastUsedAt`/`requestCount` come from the API's `GET /v1/keys` (`listTenantApiKeys()`), not the local Prisma mirror — `TenantApiKey` has no columns for either, since per-request tracking only exists API-side (`api_key_daily_usage`, added in comprobify commit `ae9c159`). The page fetches both `db.tenantApiKey.findMany()` and `listTenantApiKeys()` in parallel and merges by `apiKeyId`. The table uses `min-w-max` alongside `w-full` so it grows to fit content and relies on horizontal scroll instead of compressing columns — a compressed column let badges bleed into the neighboring one on narrow screens.

### Usage chart (`ApiKeyUsageChart`)

Expands inline under a row when "Ver uso" is clicked. A Recharts bar chart of daily request counts, fed by `getTenantApiKeyUsageAction(keyId, days)` → `getTenantApiKeyUsage()` → `GET /v1/keys/:id/usage?days=`.

- **Range toggle:** 7 / 14 / 30 days, default 14 (API supports 1–365; the UI only exposes these three presets).
- **Full range shown as-is:** the API always zero-fills the *entire* requested range regardless of when the key was created. The chart renders that full range unfiltered — a brand-new key's chart keeps the same width/frame as an older key's (mostly empty bars for a very new key, which is accurate, not a wall of misleading history).
- **Empty state:** if every day in range has zero requests, shows a text message instead of an all-zero chart.
- **Y-axis ticks:** computed explicitly in JS (`integerTicks()`) rather than left to Recharts' automatic generator, which can collapse to duplicate rounded values (e.g. every label reading "0") on small integer ranges when `allowDecimals={false}`. Axis width is likewise sized to the longest tick label instead of a fixed value, so 3–4 digit counts aren't clipped.
- The chart re-fetches on every range change; a key's history stays queryable even after it's revoked (ownership, not `active` state, gates the endpoint).

### Usage panel (Postman / curl)

Static reference card below the table: API base URL (`COMPROBIFY_API_URL`), `Authorization: Bearer` header example, a curl snippet (using the just-created key if one is in view, otherwise a placeholder), and a link to `docs.comprobify.com`.

---

## Data flow

```
1. settings/api-keys/page.tsx (Server Component)
   │  • requirePermission('apikeys.read', { skipIssuer: true })
   │  • Promise.all([
   │      db.tenantApiKey.findMany({ tenantId }),        — local mirror rows (incl. isManaged/managedRole/scopes)
   │      listTenantApiKeys({ apiKey: ctx.apiKey }),      — GET /v1/keys, lifetime lastUsedAt/requestCount
   │    ])
   │  • Merges by apiKeyId, renders <ApiKeyManager keys={...} callerScopes={computeApiScopesForRole(ctx.user.role)} />
   │
2. Create key
   │  • createTenantApiKeyAction(label, scopes)
   │  • POST /v1/keys { label, environment: ctx.tenant.environment, scopes }
   │  • Follow-up GET /v1/keys, authenticated with ctx (not the new token — it may not have
   │    keys:manage itself), to read the new key's id (POST omits it)
   │  • db.tenantApiKey.create — encrypted key + last four + scopes only
   │  • revalidatePath('/settings/api-keys')
   │
3. Revoke key
   │  • User clicks "Revocar" → opens confirm Dialog (in-app, not window.confirm)
   │  • Confirms → revokeTenantApiKeyAction(id)
   │  • Blocks if keyRow.isManaged (SELF_REVOCATION_FORBIDDEN)
   │  • DELETE /v1/keys/:apiKeyId
   │  • db.tenantApiKey.update — isActive: false, revokedAt: now
   │  • revalidatePath('/settings/api-keys')
   │
4. "Ver uso" toggle (per row, client-side)
   │  • getTenantApiKeyUsageAction(id, days)
   │  • requirePermission('apikeys.read', { skipIssuer: true }) — independent gate, not just the page's
   │  • GET /v1/keys/:apiKeyId/usage?days=7|14|30
   │  • Zero-filled series rendered as-is, full range
```

---

## Security notes

- The plaintext key is returned once, at creation, and never stored — only `encrypt(key)`, `lastFour(key)`, and `scopes` persist in `TenantApiKey`.
- `createTenantApiKeyAction` and `revokeTenantApiKeyAction` both independently call `requirePermission('apikeys.manage', ...)` — the page's own `apikeys.read` gate is not sufficient on its own (three-layer permission pattern, CLAUDE.md Common Mistake #38). `getTenantApiKeyUsageAction` is read-gated the same way.
- Any `isManaged` row (the master key, or a per-role key — see CLAUDE.md → "Per-role API key scopes") can never be revoked from this screen: the API itself refuses (`SELF_REVOCATION_FORBIDDEN`), and the action re-checks this server-side before ever calling the API.
- A key's environment is always the tenant's *current* environment, sent explicitly — never left to the API's `'sandbox'` default, which would silently mint a key that can't authenticate anything on a promoted tenant.
- A new self-service key's scopes are bounded to the caller's own resolved key's scopes, both in the UI (checklist options) and at the API (`SCOPE_ESCALATION_FORBIDDEN` containment check) — a Developer's own key can never mint one broader than itself.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/api-keys/page.tsx` | Server Component — merges local `TenantApiKey` rows with `listTenantApiKeys()`'s lifetime usage; fluid width |
| `src/components/api-key-manager.tsx` | Client Component — key table (scopes, managed badge), create form (label + scope checklist), revoke confirmation `Dialog`, Postman usage panel, per-row "Ver uso" toggle |
| `src/components/api-key-usage-chart.tsx` | Client Component — Recharts daily-request bar chart, 7/14/30-day range toggle, explicit Y-axis ticks |
| `src/app/actions/apiKeys.ts` | `createTenantApiKeyAction(label, scopes?)`, `revokeTenantApiKeyAction`, `getTenantApiKeyUsageAction` |
| `src/lib/api.ts` | `listTenantApiKeys`, `createTenantApiKey`, `revokeTenantApiKey`, `getTenantApiKeyUsage`; `ApiKeyInfo`/`ApiKeyDailyUsage`/`CreatedApiKey` types |
| `src/lib/tenant-api-key.ts` | `findMasterApiKeyRow()` + `resolveApiKeyForRole()` — see CLAUDE.md → "Per-role API key scopes" |
| `src/lib/role-api-scopes.ts` | `ApiKeyScope` type, `ROLE_API_SCOPES`, `computeApiScopesForRole()` — the role → scope mapping this screen's create form is bounded by |
| `src/lib/context.ts` | Redirects to `/settings/api-keys?missing=1` when no active key can be resolved/minted for the signed-in user's role |
| `messages/es.json` / `en.json` → `apiKeys` | Labels, table headers, `scopeLabels.*`, `usageChart.*` chart copy |
