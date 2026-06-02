# Webhook Management Screen

**Route:** `/es/settings/webhooks`  
**Component:** `src/app/[locale]/settings/webhooks/page.tsx`  
**Type:** Server Component + Client Component (`WebhookManager`)  
**Permission:** `webhooks.manage` (Owner + Admin)

---

## Purpose

Lets owners and admins register webhook endpoints with the Comprobify API so the frontend receives real-time events (document authorized, cert expiring, etc.). Active endpoints are synced to the local `WebhookEndpoint` table for display.

---

## Sections

### Register form

Fields:
- **URL** — publicly reachable HTTPS endpoint that will receive `POST` payloads
- **Event types** — multi-select checkboxes for `DOCUMENT_AUTHORIZED`, `CERT_EXPIRING`, `CERT_EXPIRED`, `SRI_SUBMISSION_FAILED`, `EMAIL_DELIVERY_FAILED`

On submit → `registerWebhookAction`:
1. `POST /api/webhooks` via `src/lib/api.ts`
2. API returns the endpoint record including the signing secret (shown **once only**)
3. Secret is encrypted with AES-256-GCM and stored in `WebhookEndpoint.encryptedSecret`
4. The cleartext secret is displayed once in the UI in a code block with a copy button; after the user dismisses the dialog, it is never shown again

### Endpoint table

Lists all active endpoints from the local DB (`WebhookEndpoint` table). Columns:
- URL
- Event types (comma-separated badges)
- Secret last four (display only)
- Delete button

Delete → `deleteWebhookAction` → `DELETE /api/webhooks/:id` + soft-delete or hard-delete from local DB.

### Signature verification snippet

A collapsible `<details>` block below the table showing example HMAC-SHA256 verification code (Node.js). Helps developers integrate the webhook receiver correctly.

---

## Data flow

```
1. settings/webhooks/page.tsx (Server Component)
   │  • requirePermission('webhooks.manage')
   │  • db.webhookEndpoint.findMany({ tenantId }) — from local DB (not API)
   │  • Renders <WebhookManager endpoints={...} />
   │
2. Register form submit
   │  • registerWebhookAction(url, eventTypes)
   │  • POST /api/webhooks → { id, url, secret, eventTypes }
   │  • db.webhookEndpoint.upsert — secret encrypted at rest
   │  • Returns cleartext secret for one-time display
   │
3. Delete button
   │  • deleteWebhookAction(endpointId)
   │  • DELETE /api/webhooks/:apiEndpointId
   │  • db.webhookEndpoint.delete
   │  • UI removes row optimistically
```

---

## Security notes

- The webhook signing secret is stored encrypted (`AES-256-GCM` via `src/lib/crypto.ts`) — same algorithm used for `TenantApiKey`.
- The cleartext secret is returned only once (at registration time) and immediately discarded server-side.
- The receiver route (`src/app/api/webhooks/receive/route.ts`) verifies the HMAC-SHA256 signature on every incoming request. Requests with invalid signatures return `401`.
- `request.text()` is called **before** `JSON.parse()` in the receiver to preserve the raw body for HMAC comparison.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/webhooks/page.tsx` | Server Component — loads endpoints from DB, requires `webhooks.manage` |
| `src/components/webhook-manager.tsx` | Client Component — register form, endpoint table, delete, code snippet |
| `src/app/actions/webhooks.ts` | `registerWebhookAction`, `deleteWebhookAction`, `listWebhooksAction`, `ensureWebhookRegisteredAction` |
| `src/app/api/webhooks/receive/route.ts` | Incoming webhook receiver — HMAC verify + upsert |
| `src/lib/api.ts` | `registerWebhookEndpoint`, `listWebhookEndpoints`, `updateWebhookEndpoint`, `deleteWebhookEndpoint` |
| `src/lib/crypto.ts` | `encrypt` / `decrypt` for secrets at rest |
| `messages/es.json` → `webhooks` | Labels, placeholders, error messages |
