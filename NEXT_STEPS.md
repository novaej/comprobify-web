# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Remaining screen work

1. **Issuers — issuer info card** — display issuer name, RUC, cert expiry and fingerprint in the `/issuers` screen. Requires a Comprobify API endpoint that returns per-issuer cert metadata (`certFingerprint`, `certExpiry`). Check current API docs for the correct endpoint path (`GET /api/issuers/:id` or similar).

2. **Rebuild Invoice button** — show a Rebuild button on Invoice Detail for `RETURNED` / `NOT_AUTHORIZED` documents. `requestPayload` is now included in document responses — use it to pre-fill the form.

3. **Dashboard — summary cards** — KPI cards showing: issued this month (by type), net authorized revenue this month (FAC + LIQ + DEB − CRE), and "needs attention" count (RETURNED + NOT_AUTHORIZED). Fetch from `GET /api/documents/stats` which returns `{ stats: { thisMonth: { byType: [{ type, issued, authorizedTotal }] }, needsAttention } }`. Saved clients and products counts come from local Prisma. Also cap the document table to ~10 rows with a "Ver todos" link.

4. **Dashboard — pagination** — the list currently loads up to 50 documents. Add page controls using the `pagination` object returned by `listDocuments()`.

5. **Complete registration flow** — `/complete-registration` page for invited users (`inviteStatus === 'INVITED'`, no password yet). Should set the password and flip `inviteStatus` to `'ACTIVE'`. Currently redirects to a 404.

---

## Infrastructure

6. **P12 certificate expiration alerts** — surface a persistent in-app notification when an issuer's signing certificate is expired or about to expire (e.g. within 30 days), so users know they cannot create or authorize documents before renewing. Depends on **notification module** (see item 7). Implementation sketch:
   - The API already stores cert metadata per-issuer; expose it on `GET /api/issuers/:id` if not already present (`certExpiry`, `certFingerprint`).
   - On login (in `loginAction` / `requireContext`) or on the first page load of a session, fetch cert expiry for the active issuer and write a flag to the `comprobify_ctx` cookie or a server-side session cache.
   - Show the notification as a dismissible banner above the page content (but below the `SandboxBanner`) when `certExpired === true` or `daysUntilExpiry < 30`.
   - Consider polling the expiry check at low frequency (e.g. on navigation) rather than on every request — cert expiry is slow-moving data.

7. **Notification / alert module** — a lightweight system to surface async or persistent alerts to the user (cert expiry, failed email delivery, quota warnings, etc.). See architecture discussion below.

8. **Error boundary** — add `error.tsx` in `src/app/[locale]/` to catch Server Component errors and show a user-friendly page using the `apiError` i18n namespace.

9. **Loading skeletons** — add `loading.tsx` in `src/app/[locale]/dashboard/` and `src/app/[locale]/invoices/[key]/` using the `<Skeleton>` component from shadcn while Server Components fetch.

10. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

---

## Polish

11. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.

---

## Architecture note — notification module

**The notification module belongs in the API (`comprobify`), not in the frontend.**

### Why the API, not the frontend

1. **The events that need notifications originate in the API.** Cert expiry, SRI authorization failures, failed email deliveries, sequence exhaustion — all happen inside the API layer. The API already has the data; the frontend would have to poll for it constantly to stay current.

2. **Notifications need to survive across sessions.** If a cert expires while the user is logged out, the alert has to be waiting for them on next login. Storing that in the frontend (cookie, localStorage) means it disappears on a different device or browser. A server-side `notifications` table is the only durable store.

3. **Multi-user tenants.** When one user's action triggers an alert, all tenant users should see it. That fan-out is trivial in the API (one row per tenant) and hard to replicate in the frontend.

4. **The frontend is already a thin BFF.** Adding notification business logic here (deciding *what* is a notification, when to create one, when it expires) would be feature creep on the wrong layer.

### What the API should own

- A `notifications` table: `{ id, tenantId, issuerId?, type, severity, message, readAt, expiresAt }`.
- Background jobs (or inline checks in existing flows) that insert rows — e.g. a cron that checks cert expiry daily and upserts a `CERT_EXPIRING` or `CERT_EXPIRED` notification.
- `GET /api/notifications` — returns unread/active notifications for the authenticated tenant (no issuer context needed).
- `POST /api/notifications/:id/read` — marks one as read.

### What the frontend should own

- `listNotifications(ctx)` in `src/lib/api.ts` — calls `GET /api/notifications`.
- A `NotificationBanner` component rendered in the locale layout (below `SandboxBanner`) that shows the highest-severity active notification.
- On login (`loginAction`) or layout load, fetch notifications server-side and pass them as props — no polling needed since these are slow-moving signals.
- If real-time delivery is ever needed later, add a lightweight SSE or WebSocket channel — but for cert expiry and similar low-frequency events, per-navigation fetching is sufficient.

### Minimum viable first step

Implement cert expiry checking as a direct API call (no full notification system yet): add `certExpiry` to `GET /api/issuers/:id`, fetch it in `requireContext()` or the layout, and show a banner. Build the general notification module only when a second alert type emerges.
