# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Infrastructure hygiene

1. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

2. **Backfill canonical webhook registration for existing tenants** — every tenant needs exactly one webhook endpoint registered at `/api/webhooks/receive` so the API pushes notifications to it in near-real time; the receiver already does the addressing (HMAC verify, upsert, fan out `NotificationRead` rows by role/issuer access via `fanOutReads`). Today this endpoint is only created in `bootstrapTenantAction` during onboarding, and only when `NEXT_PUBLIC_APP_URL` is set at that exact moment (best-effort, silently skipped/failed otherwise — see `webhook_endpoints` table, currently empty for this tenant). `ensureWebhookRegisteredAction` (`src/app/actions/webhooks.ts:110`) already contains the "create the canonical endpoint if missing" logic but is never called from anywhere. Call it from a suitable lifecycle point (e.g. the locale layout for Owner/Admin) so tenants that onboarded before the URL was configured — or whose registration attempt failed — get backfilled instead of relying solely on `<NotificationSync />`'s catch-up poll.
