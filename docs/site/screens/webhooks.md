# Webhook Management Screen

**Route:** `/es/settings/webhooks`
**Component:** `src/app/[locale]/settings/webhooks/page.tsx`
**Type:** Server Component + Client Component (`WebhookManager`)
**Permission:** `webhooks.manage` (Owner + Admin)

---

## Purpose

Lets Owner/Admin register webhook endpoints so external systems (or comprobify-web's own in-app notification bell) receive real-time Comprobify events (document authorized, cert expiring/expired, SRI submission failed, email delivery failed, quota warning). Endpoints are synced to the local `WebhookEndpoint` table for display.

Two structurally different kinds of endpoint live on this one screen:

1. **The canonical in-app webhook** — comprobify-web's own endpoint (`/api/webhooks/receive`), which feeds the notification bell. Minted `is_reserved: true` through the admin-gated path (comprobify migration 102), so it's excluded from the tenant's own self-service pool/budget entirely.
2. **Custom endpoints** — a tenant's own integrations, subject to the tier's `maxWebhookEndpoints`.

---

## Sections

### Usage counter and tier limit

A persistent "X of Y webhooks used" line (or "(ilimitado)"/"(unlimited)" for `maxEndpoints === null`) sits above everything else, sourced from `listWebhookEndpoints()`'s own `limit: { max, used }` — a plain passthrough of the tier's `maxWebhookEndpoints` (the canonical webhook is excluded, not padded headroom). If `max === 0`, the counter is hidden in favor of a `noCustomAccess` banner; if `used >= max`, a `limitReached` banner appears and both "Activate canonical" and "Add custom endpoint" disable.

### Canonical webhook card

Always the first card on the page. Shows one of three states based on `canonicalAvailability` (computed server-side from `getCanonicalWebhookUrl()`/`isPubliclyReachableHttpsUrl()`):
- `not_configured` — `NEXT_PUBLIC_APP_URL` isn't set; nothing to activate.
- `invalid_url` — the resolved URL isn't a public HTTPS address (e.g. `localhost` in local dev — **this is why canonical webhooks can't be tested locally**, only against a deployed environment).
- `available` — shows an "Activar"/"Desactivar" toggle. **First-time activation** goes through `activateCanonicalWebhookAction` → the admin-gated `createReservedWebhookEndpoint()` (the tenant-facing `POST /v1/webhooks` has no `isReserved` param at all). **Re-activating after a prior deactivation, and deactivating**, are both plain tenant-facing calls (`updateWebhookEndpoint()`/`deleteWebhookEndpoint()`) — no admin path needed for either, since a webhook's `active` flag isn't a credential the way an API key is (see CLAUDE.md → "Canonical webhook: reserved, but tenant-toggleable").

### Register form (custom endpoints)

Fields:
- **URL** — publicly reachable HTTPS endpoint that will receive `POST` payloads
- **Event types** — collapsible checklist over `ALL_EVENT_TYPES` (`DOCUMENT_AUTHORIZED`, `CERT_EXPIRING`, `CERT_EXPIRED`, `SRI_SUBMISSION_FAILED`, `EMAIL_DELIVERY_FAILED`, `QUOTA_WARNING`); none selected means "all events"

On submit → `registerWebhookAction(url, eventTypes?)`:
1. `POST /v1/webhooks` via `src/lib/api.ts` (tenant-facing, never the admin path — this is the tenant's own endpoint)
2. API returns the endpoint record plus a signing secret
3. The secret is AES-256-GCM-encrypted and stored in `WebhookEndpoint.encryptedSecret` — **the UI does not currently display the cleartext secret anywhere**, before or after encryption; the form just reloads the page on success. A tenant integrating their own receiver has no in-app way to retrieve the secret needed for the HMAC verification snippet below it on this same page.

### Endpoint table

Custom endpoints only (the canonical one has its own card above, filtered out via `customEndpoints = endpoints.filter((e) => e.id !== canonicalEndpoint?.id)`). Columns: URL, event types (badges, or "todos los eventos" if empty), status (active/inactive), created date, delete button (`deleteWebhookAction` → `DELETE /v1/webhooks/:id`, `confirm()`-gated, optimistic row removal).

### Signature verification snippet

A collapsible `<details>` block (only shown once at least one endpoint exists) with example Node.js HMAC-SHA256 verification code — timestamp + raw body, 300-second freshness window, `timingSafeEqual` comparison. Illustrative only; see the note above about the secret itself not being retrievable from this screen today.

---

## Data flow

```
1. settings/webhooks/page.tsx (Server Component)
   │  • requirePermission('webhooks.manage', { skipIssuer: true })
   │  • Promise.all([
   │      db.webhookEndpoint.findMany({ tenantId, active: true }),  — local mirror, active rows only
   │      listWebhookEndpoints({ apiKey: ctx.apiKey }),              — GET /v1/webhooks, limit: { max, used }
   │    ])
   │  • Splits canonical vs. custom by matching getCanonicalWebhookUrl() against endpoint.url
   │  • Renders <WebhookManager endpoints={customEndpoints} canonicalAvailability canonicalEndpointId usedEndpoints={limit.used} maxEndpoints={limit.max} customWebhooksAllowed />
   │
2. Activate canonical (first time)
   │  • activateCanonicalWebhookAction → createReservedWebhookEndpoint() (admin-gated, POST /v1/admin/tenants/:id/webhook-endpoints)
   │  • db.webhookEndpoint.create — is_reserved, encrypted secret
   │
3. Activate canonical (re-activation) / Deactivate
   │  • updateWebhookEndpoint() / deleteWebhookAction → DELETE /v1/webhooks/:id (tenant-facing, both legal on a reserved row for `active` alone)
   │
4. Register custom endpoint
   │  • registerWebhookAction(url, eventTypes?)
   │  • POST /v1/webhooks { url, eventTypes }
   │  • db.webhookEndpoint.create — encrypted secret, is_reserved: false
   │
5. Delete custom endpoint
   │  • deleteWebhookAction(endpointId)
   │  • DELETE /v1/webhooks/:apiEndpointId
   │  • db.webhookEndpoint.delete (local), optimistic UI removal
```

---

## Security notes

- The webhook signing secret is stored encrypted (`AES-256-GCM` via `src/lib/crypto.ts`) — same algorithm used for `TenantApiKey`.
- The receiver route (`src/app/api/webhooks/receive/route.ts`) verifies the HMAC-SHA256 signature on every incoming request. `request.text()` is called **before** `JSON.parse()` to preserve the raw body for HMAC comparison (CLAUDE.md Common Mistake #19) — reversing that order silently breaks verification for every webhook.
- The canonical webhook's `url`/`eventTypes` can never be changed by the tenant, even though `active` can — retargeting comprobify-web's own receiver isn't something self-service should be able to do.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/webhooks/page.tsx` | Server Component — merges local mirror with `listWebhookEndpoints()`'s `limit`, splits canonical vs. custom |
| `src/components/webhook-manager.tsx` | Client Component — usage counter, canonical card, register form, endpoint table, HMAC snippet |
| `src/app/actions/webhooks.ts` | `registerWebhookAction`, `deleteWebhookAction`, `listWebhooksAction`, `activateCanonicalWebhookAction`, `ensureWebhookRegisteredAction` |
| `src/app/api/webhooks/receive/route.ts` | Incoming webhook receiver — HMAC verify + `Notification` upsert |
| `src/lib/api.ts` | `registerWebhookEndpoint`, `listWebhookEndpoints`, `updateWebhookEndpoint`, `deleteWebhookEndpoint` |
| `src/lib/admin-api.ts` | `createReservedWebhookEndpoint()` — admin-gated first-time canonical mint |
| `src/lib/webhook-url.ts` | `getCanonicalWebhookUrl()`, `isPubliclyReachableHttpsUrl()` |
| `src/lib/crypto.ts` | `encrypt` / `decrypt` for secrets at rest |
| `messages/es.json` / `en.json` → `webhooks` | Labels, placeholders, `canonical.*`, error messages |
