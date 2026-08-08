# API Keys Screen

**Route:** `/es/settings/api-keys`  
**Component:** `src/app/[locale]/settings/api-keys/page.tsx`  
**Type:** Server Component + Client Component (`ApiKeyManager`)  
**Permission:** `apikeys.read` (view) / `apikeys.manage` (create, revoke) — Owner + Admin

Moved here from the former top-level `/api-keys` route; content-width-wise it stays in the fluid list/table cluster (not `max-w-3xl`) despite living under `/settings`, since its main content is a table — see CLAUDE.md → "Page content width".

---

## Purpose

Self-service Comprobify API key management for Postman, an ERP, or any direct integration outside this web app. Also shows, per key, lifetime usage totals and a daily request-volume chart, so an Owner/Admin can tell which integrations are actually active before revoking a key.

---

## Sections

### Missing-key warning

Shown when the tenant has zero active keys (`missingKey` prop) — the app itself can't authenticate any request until one exists. `requireContext()` redirects here with `?missing=1` when it can't resolve an active `TenantApiKey` row (see `src/lib/context.ts`).

### Create form

Single `label` field (defaults to `"default"` if left blank). On submit → `createTenantApiKeyAction`:
1. `POST /v1/keys` with `environment` sent **explicitly** as `ctx.tenant.environment` (the API defaults to `'sandbox'` if omitted, which would mint a key that 401s with `API_KEY_ENV_MISMATCH` on a promoted tenant).
2. The plaintext token is shown once (copy-once display, `showKey` toggle) and never persisted in cleartext — only its AES-256-GCM-encrypted form and last four digits are stored in `TenantApiKey`.

### Key table

One row per `TenantApiKey`, columns:
- Label (+ "En uso por la app" badge for the row `findAppApiKeyRow()` resolves as the key this web app itself authenticates with — revoke button disabled for that row, both in the UI and re-checked server-side in `revokeTenantApiKeyAction`)
- Environment
- Last four digits
- Status (active/revoked)
- Created date
- **Last used** — lifetime `lastUsedAt`, or "Nunca"/"Never" if the key has never authenticated a request
- **Requests** — lifetime `requestCount`, not windowed
- "Ver uso" toggle — expands the usage chart inline below the row
- Revoke button (`apikeys.manage` only; disabled for revoked keys and the app's own key)

`lastUsedAt`/`requestCount` come from the API's `GET /v1/keys` (`listTenantApiKeys()`), not the local Prisma mirror — `TenantApiKey` has no columns for either, since per-request tracking only exists API-side (`api_key_daily_usage`, added in comprobify commit `ae9c159`). The page fetches both `db.tenantApiKey.findMany()` and `listTenantApiKeys()` in parallel and merges by `apiKeyId`.

### Usage chart (`ApiKeyUsageChart`)

Expands inline under a row when "Ver uso" is clicked. A Recharts bar chart of daily request counts, fed by `getTenantApiKeyUsageAction(keyId, days)` → `getTenantApiKeyUsage()` → `GET /v1/keys/:id/usage?days=`.

- **Range toggle:** 7 / 30 / 90 days (API supports 1–365; the UI only exposes these three presets).
- **Pre-history filtering:** the API always zero-fills the *entire* requested range regardless of when the key was created — a key created 3 days ago on a 30-day view still gets 27 empty days back-filled. The component is passed the key's `createdAt` and drops any entry dated before it, so a recent key doesn't show a wall of empty bars for history it couldn't have.
- **Empty state:** if every remaining day (after the above filter) has zero requests, shows a text message instead of an all-zero chart.
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
   │      db.tenantApiKey.findMany({ tenantId }),        — local mirror rows
   │      findAppApiKeyRow(tenantId, environment),        — which row the app itself uses
   │      listTenantApiKeys({ apiKey: ctx.apiKey }),       — GET /v1/keys, lifetime lastUsedAt/requestCount
   │    ])
   │  • Merges by apiKeyId, renders <ApiKeyManager keys={...} />
   │
2. Create key
   │  • createTenantApiKeyAction(label)
   │  • POST /v1/keys { label, environment: ctx.tenant.environment }
   │  • Follow-up GET /v1/keys with the new token to read its id (POST omits it)
   │  • db.tenantApiKey.create — encrypted key + last four only
   │  • revalidatePath('/settings/api-keys')
   │
3. Revoke key
   │  • revokeTenantApiKeyAction(id)
   │  • Blocks if id === findAppApiKeyRow's id (SELF_REVOCATION_FORBIDDEN)
   │  • DELETE /v1/keys/:apiKeyId
   │  • db.tenantApiKey.update — isActive: false, revokedAt: now
   │  • revalidatePath('/settings/api-keys')
   │
4. "Ver uso" toggle (per row, client-side)
   │  • getTenantApiKeyUsageAction(id, days)
   │  • requirePermission('apikeys.read', { skipIssuer: true }) — independent gate, not just the page's
   │  • GET /v1/keys/:apiKeyId/usage?days=7|30|90
   │  • Zero-filled series → filtered client-side to createdAt..today → rendered as a bar chart
```

---

## Security notes

- The plaintext key is returned once, at creation, and never stored — only `encrypt(key)` and `lastFour(key)` persist in `TenantApiKey`.
- `createTenantApiKeyAction` and `revokeTenantApiKeyAction` both independently call `requirePermission('apikeys.manage', ...)` — the page's own `apikeys.read` gate is not sufficient on its own (three-layer permission pattern, CLAUDE.md Common Mistake #38). `getTenantApiKeyUsageAction` is read-gated the same way.
- The row the web app itself authenticates with (`findAppApiKeyRow()` — oldest active row matching the tenant's environment, deterministic on purpose) can never be revoked from this screen: the API itself refuses (`SELF_REVOCATION_FORBIDDEN`), and the action re-checks this server-side before ever calling the API.
- A key's environment is always the tenant's *current* environment, sent explicitly — never left to the API's `'sandbox'` default, which would silently mint a key that can't authenticate anything on a promoted tenant.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/api-keys/page.tsx` | Server Component — merges local `TenantApiKey` rows with `listTenantApiKeys()`'s lifetime usage; fluid width |
| `src/components/api-key-manager.tsx` | Client Component — key table, create form, Postman usage panel, per-row "Ver uso" toggle |
| `src/components/api-key-usage-chart.tsx` | Client Component — Recharts daily-request bar chart, 7/30/90-day range toggle, pre-history filtering, explicit Y-axis ticks |
| `src/app/actions/apiKeys.ts` | `createTenantApiKeyAction`, `revokeTenantApiKeyAction`, `getTenantApiKeyUsageAction` |
| `src/lib/api.ts` | `listTenantApiKeys`, `createTenantApiKey`, `revokeTenantApiKey`, `getTenantApiKeyUsage`; `ApiKeyInfo`/`ApiKeyDailyUsage` types |
| `src/lib/tenant-api-key.ts` | `findAppApiKeyRow()` — deterministic resolver for "which key does the web app itself use" |
| `src/lib/context.ts` | Redirects to `/settings/api-keys?missing=1` when no active app key is found |
| `messages/es.json` / `en.json` → `apiKeys` | Labels, table headers, `usageChart.*` chart copy |
