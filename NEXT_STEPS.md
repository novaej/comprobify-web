# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Infrastructure hygiene

1. **Backfill canonical webhook registration for existing tenants** — every tenant needs exactly one webhook endpoint registered at `/api/webhooks/receive` so the API pushes notifications to it in near-real time; the receiver already does the addressing (HMAC verify, upsert, fan out `NotificationRead` rows by role/issuer access via `fanOutReads`). Today this endpoint is only created in `bootstrapTenantAction` during onboarding, and only when `NEXT_PUBLIC_APP_URL` is set at that exact moment (best-effort, silently skipped/failed otherwise — see `webhook_endpoints` table, currently empty for this tenant). `ensureWebhookRegisteredAction` (`src/app/actions/webhooks.ts:110`) already contains the "create the canonical endpoint if missing" logic but is never called from anywhere. Call it from a suitable lifecycle point (e.g. the locale layout for Owner/Admin) so tenants that onboarded before the URL was configured — or whose registration attempt failed — get backfilled instead of relying solely on `<NotificationSync />`'s catch-up poll.

## Feature gaps

2. **Surface the actual SRI rejection reason text for RETURNED/NOT_AUTHORIZED documents** — when SRI rejects a document, its human-readable rejection message (e.g. "RUC no existe", "clave de acceso reutilizada") is sent back and stored server-side in the `sri_responses` table (`../comprobify/src/models/sri-response.model.js`), but no API endpoint exposes it. Invoice Detail's events timeline (`src/lib/event-description.ts`) can today only show the bare SRI status code (e.g. `NO_AUTORIZADO`) for a rejection, not why. Needs a new backend endpoint (e.g. `GET /v1/documents/:key/sri-responses`) in `comprobify` before the frontend can show the real reason.
