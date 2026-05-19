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

6. **Error boundary** — add `error.tsx` in `src/app/[locale]/` to catch Server Component errors and show a user-friendly page using the `apiError` i18n namespace.

7. **Loading skeletons** — add `loading.tsx` in `src/app/[locale]/dashboard/` and `src/app/[locale]/invoices/[key]/` using the `<Skeleton>` component from shadcn while Server Components fetch.

8. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

---

## Polish

9. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.
