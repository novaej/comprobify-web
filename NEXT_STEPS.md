# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Screen work

1. **Issuers — cert info card** — display cert expiry date and fingerprint in the `/issuers` screen per issuer. Requires checking whether `GET /api/issuers/:id` (or the list endpoint) already returns `certExpiry` and `certFingerprint`; if not, request the API endpoint first.

2. **Rebuild Invoice button** — show a Rebuild button on Invoice Detail for `RETURNED` / `NOT_AUTHORIZED` documents. `requestPayload` is now included in document responses — use it to pre-fill the form.

3. **Dashboard — summary cards** — KPI cards showing: issued this month (by type), net authorized revenue this month (FAC + LIQ + DEB − CRE), and "needs attention" count (RETURNED + NOT_AUTHORIZED). Fetch from `GET /api/documents/stats` which returns `{ stats: { thisMonth: { byType: [{ type, issued, authorizedTotal }] }, needsAttention } }`. Also cap the document table to ~10 rows with a "Ver todos" link.

4. **Dashboard — pagination** — the list currently loads up to 50 documents. Add page controls using the `pagination` object returned by `listDocuments()`.

---

## Infrastructure hygiene

5. **Error boundary** — add `error.tsx` in `src/app/[locale]/` to catch Server Component errors and show a user-friendly page using the `apiError` i18n namespace instead of a blank screen.

6. **Loading skeletons** — add `loading.tsx` in `src/app/[locale]/dashboard/` and `src/app/[locale]/invoices/[key]/` using the `<Skeleton>` component from shadcn while Server Components fetch.

7. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

8. **Backfill canonical webhook registration for existing tenants** — every tenant needs exactly one webhook endpoint registered at `/api/webhooks/receive` so the API pushes notifications to it in near-real time; the receiver already does the addressing (HMAC verify, upsert, fan out `NotificationRead` rows by role/issuer access via `fanOutReads`). Today this endpoint is only created in `bootstrapTenantAction` during onboarding, and only when `NEXT_PUBLIC_APP_URL` is set at that exact moment (best-effort, silently skipped/failed otherwise — see `webhook_endpoints` table, currently empty for this tenant). `ensureWebhookRegisteredAction` (`src/app/actions/webhooks.ts:110`) already contains the "create the canonical endpoint if missing" logic but is never called from anywhere. Call it from a suitable lifecycle point (e.g. the locale layout for Owner/Admin) so tenants that onboarded before the URL was configured — or whose registration attempt failed — get backfilled instead of relying solely on `<NotificationSync />`'s catch-up poll.

---

## Polish

9. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.
