# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Remaining screen work

1. **Settings — issuer info card** — display issuer name, RUC, cert expiry and fingerprint. `GET /api/issuers/me` is now available; returns `ruc`, `businessName`, `tradeName`, `branchCode`, `issuePointCode`, `sandbox`, `certFingerprint`, `certExpiry`.

2. **Rebuild Invoice button** — show a Rebuild button on Invoice Detail for `RETURNED` / `NOT_AUTHORIZED` documents. `requestPayload` is now included in document responses — use it to pre-fill the form.

3. **Dashboard — summary cards** — total invoices, authorized this month, pending (SIGNED + RECEIVED). Fetch from `GET /api/documents` with status filters.

4. **Dashboard — pagination** — the list currently loads up to 50 documents. Add page controls using the `pagination` object returned by `listDocuments()`.

5. **Settings — API key reveal** — masked `<input>` pre-filled with `••••••••`. A "Mostrar clave" button triggers a Server Action that fetches the key from the DB via `requireApiKey()` and returns it to the client only on explicit user action.

6. **Client management** — CRUD screen for saved clients (name, identification type + number, email, address). In the document creation form, add a client search/autocomplete field: typing the identification number looks up saved clients and pre-fills the buyer section. Clients stored in the app's own DB (Prisma), not the Comprobify API.

---

## Infrastructure

7. **Error boundary** — add `error.tsx` in `src/app/[locale]/` to catch Server Component errors and show a user-friendly page using the `apiError` i18n namespace.

8. **Loading skeletons** — add `loading.tsx` in `src/app/[locale]/dashboard/` and `src/app/[locale]/invoices/[key]/` using the `<Skeleton>` component from shadcn while Server Components fetch.

9. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

---

## Polish

10. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.
