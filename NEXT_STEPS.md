# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Notification system gaps

1. **Catch-up sync on login** — `catchUpNotificationsAction()` is defined but never called. Add a call in `loginAction` (after post-login redirect logic is determined) or as a client-side effect on first authenticated load, so the bell is populated even when webhooks were missed during downtime.

2. **Bell unread count auto-refresh** — the panel refreshes when opened, but the badge count doesn't update while the page sits idle. Add a `setInterval` or a short TanStack Query polling interval (e.g. 60s) in `NotificationBell` to re-fetch the unread count in the background.

3. **Cert-expiry banner** — `CERT_EXPIRING` / `CERT_EXPIRED` notifications arrive via webhook and appear in the bell panel, but they're easy to miss. Add a dismissible banner rendered between `SandboxBanner` and `{children}` in the locale layout when an unread cert alert exists for the active issuer. Auto-dismiss when the notification is marked read.

---

## Remaining screen work

4. **Issuers — cert info card** — display cert expiry date and fingerprint in the `/issuers` screen per issuer. Requires checking whether `GET /api/issuers/:id` (or the list endpoint) already returns `certExpiry` and `certFingerprint`; if not, request the API endpoint first.

5. **Rebuild Invoice button** — show a Rebuild button on Invoice Detail for `RETURNED` / `NOT_AUTHORIZED` documents. `requestPayload` is now included in document responses — use it to pre-fill the form.

6. **Dashboard — summary cards** — KPI cards showing: issued this month (by type), net authorized revenue this month (FAC + LIQ + DEB − CRE), and "needs attention" count (RETURNED + NOT_AUTHORIZED). Fetch from `GET /api/documents/stats` which returns `{ stats: { thisMonth: { byType: [{ type, issued, authorizedTotal }] }, needsAttention } }`. Also cap the document table to ~10 rows with a "Ver todos" link.

7. **Dashboard — pagination** — the list currently loads up to 50 documents. Add page controls using the `pagination` object returned by `listDocuments()`.

---

## Infrastructure hygiene

8. **Error boundary** — add `error.tsx` in `src/app/[locale]/` to catch Server Component errors and show a user-friendly page using the `apiError` i18n namespace instead of a blank screen.

9. **Loading skeletons** — add `loading.tsx` in `src/app/[locale]/dashboard/` and `src/app/[locale]/invoices/[key]/` using the `<Skeleton>` component from shadcn while Server Components fetch.

10. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

---

## Polish

11. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.
