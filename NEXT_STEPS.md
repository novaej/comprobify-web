# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## API gap (backend fix required)

1. **Add `buyerName` and `buyerId` to the Comprobify API presenter** (`src/presenters/document.presenter.js` in the `comprobify` repo). The dashboard table needs buyer info. Currently `formatDocument` omits these fields.

---

## Phase 3 — Screen implementation

2. **Dashboard — summary cards** — total invoices, authorized this month, pending (SIGNED + RECEIVED count). Fetch from `GET /api/documents` with appropriate filters.

3. **Dashboard — invoice list table** — paginated table with columns: sequential, buyer name, total, status badge, date. Clicking a row navigates to Invoice Detail.

4. **Create Invoice form** — React Hook Form + Zod schema mirroring the API validator. Sections: Buyer, Line items (add/remove rows), Payment. Live totals calculated client-side. Server Action calls `POST /api/documents`. On success → redirect to Invoice Detail.

5. **Invoice Detail — contextual action buttons** — render based on `document.status`:
   - `SIGNED`: Send to SRI button (Server Action → `POST /:key/send`)
   - `RECEIVED`: Verify authorization button (Server Action → `GET /:key/authorize`)
   - `AUTHORIZED`: Download PDF, Download XML, Resend email
   - `RETURNED` / `NOT_AUTHORIZED`: View SRI errors, Rebuild button

6. **Invoice Detail — status polling** — when `status === 'RECEIVED'`, use TanStack Query to poll `GET /api/documents/:key/status` every 5 seconds. Stop after 2 minutes, then show a manual "Check again" button.

7. **Invoice Detail — line items table** — display items fetched from the document. Note: the current API presenter may not return line items; check and update if needed.

8. **Invoice Detail — events timeline** — chronological list from `GET /:key/events`. Show event type (translated), timestamp, and detail.

9. **Rebuild Invoice form** — pre-filled version of the Create Invoice form. Loaded with the original invoice data when the user clicks "Reconstruir" from a `RETURNED` or `NOT_AUTHORIZED` invoice.

10. **Settings — issuer information** — name, RUC, sandbox/production badge, certificate expiry and fingerprint. Requires either a new `GET /api/issuer/me` endpoint on the Comprobify API or reading from a config env var.

11. **Settings — API key reveal** — Server Action behind a "Reveal" button. Returns `COMPROBIFY_API_KEY` from the server environment (only on explicit user action).

---

## Phase 3 — Infrastructure

12. **Error boundary** — `error.tsx` in `[locale]/` that catches Server Component errors and shows a user-friendly page using the `apiError` i18n namespace.

13. **Loading skeleton** — `loading.tsx` in `[locale]/dashboard/` and `[locale]/invoices/[key]/` that shows skeleton cards while Server Components are fetching.

14. **`not-found.tsx`** — locale-aware 404 page for `[locale]/`.

---

## Phase 2 — Multi-user auth (after MVP is in use)

15. **NextAuth.js credentials provider** — email + password login. Store `comprobify_api_key` in encrypted JWT. Keep API key out of the session object sent to the browser. See ADR-003 and FRONTEND_MVP.md.

16. **Frontend user database** — separate PostgreSQL instance with `users`, `buyers`, and `products` tables. See FRONTEND_MVP.md Phase 2 schema.

17. **Language switcher** — allow users to switch between `/es/` and `/en/` locales. Currently the English locale exists but no switcher is shown.

18. **Saved buyer address book** — select a saved buyer when creating an invoice instead of filling fields each time.

---

## Phase 2 — Polish

19. **Mobile-responsive layout** — the current nav is a sidebar. On mobile, replace with a bottom nav or hamburger menu.

20. **Dark mode** — shadcn ships dark mode CSS variables; wire up a theme toggle.

21. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.
