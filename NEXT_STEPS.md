# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Blocked on API changes (backend fix required)

1. **Add `requestPayload` to the document presenter** (`src/presenters/document.presenter.js` in the `comprobify` repo) — needed to pre-fill the Rebuild Invoice form. Once available, implement the Rebuild button on Invoice Detail for `RETURNED` / `NOT_AUTHORIZED` documents.

2. **Add `GET /api/issuer/me` endpoint** to the Comprobify API — returns issuer name, RUC, sandbox flag, cert expiry and fingerprint. Needed for the Settings issuer info card.

---

## Phase 3 — Remaining screen work

3. **Dashboard — summary cards** — total invoices, authorized this month, pending (SIGNED + RECEIVED). Fetch from `GET /api/documents` with status filters.

4. **Dashboard — pagination** — the list currently loads up to 50 documents. Add page controls using the `pagination` object returned by `listDocuments()`.

5. **Settings — API key reveal** — masked `<input>` pre-filled with `••••••••`. A "Mostrar clave" button triggers a Server Action that reads `COMPROBIFY_API_KEY` from `process.env` and returns it to the client only on explicit user action.

---

## Phase 3 — Infrastructure

6. **Error boundary** — add `error.tsx` in `src/app/[locale]/` to catch Server Component errors and show a user-friendly page using the `apiError` i18n namespace.

7. **Loading skeletons** — add `loading.tsx` in `src/app/[locale]/dashboard/` and `src/app/[locale]/invoices/[key]/` using the `<Skeleton>` component from shadcn while Server Components fetch.

8. **`not-found.tsx`** — locale-aware 404 page in `src/app/[locale]/` with a link back to the dashboard.

---

## Phase 2 — Multi-user auth (after MVP is in use)

9. **NextAuth.js credentials provider** — email + password login. Store `comprobify_api_key` in encrypted JWT. Keep API key out of the session object sent to the browser. See ADR-003 and FRONTEND_MVP.md.

10. **Frontend user database** — separate PostgreSQL instance with `users`, `buyers`, and `products` tables. See FRONTEND_MVP.md Phase 2 schema.

11. **Language switcher** — allow users to switch between `/es/` and `/en/` locales. The English locale file is already complete; just needs a switcher UI component.

12. **Saved buyer address book** — select a saved buyer when creating an invoice instead of filling fields each time.

---

## Phase 2 — Polish

13. **Mobile-responsive layout** — the current nav is a sidebar. On mobile, replace with a bottom nav or hamburger menu.

14. **Dark mode** — shadcn ships dark mode CSS variables; wire up a theme toggle.

15. **Invoice PDF preview** — embed a PDF viewer on the Invoice Detail page for `AUTHORIZED` documents.
