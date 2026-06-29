# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Legal & compliance (high priority)

1. **Build Terms of Service, Privacy Policy, and gate signup on acceptance** — frontend-owned, static pages; no legal content lives in the API.

   **Documents:**
   - *Terms of Service* — service contract, liability limits, acceptable use, subscription/cancellation terms. Gates signup.
   - *Privacy Policy* — LOPDP-compliant data handling disclosure. Gates signup.
   - *DPA (Data Processing Agreement)* — establishes Comprobify as data processor, client as data controller, for paying B2B clients. Does **not** gate signup — handle as a downloadable template/manual process for now, not an in-app checkbox.

   **Privacy Policy content checklist** (pulled from how the API actually works, not generic boilerplate):
   - *What's collected:* tenant email; buyer RUC/name/address per document; issuer's private key (AES-256-GCM encrypted) and certificate; request IPs (rate limiting/logs).
   - *Why:* to generate and submit legally valid SRI electronic invoices on the tenant's behalf.
   - *Role:* Comprobify is the data processor; the tenant (business) is the data controller who decides what buyer data gets submitted — state this distinction explicitly, it matters under LOPDP.
   - *Security measures:* PostgreSQL Row-Level Security isolating each tenant's rows, AES-256-GCM key encryption, TLS in transit, admin access gated by a separate secret.
   - *Retention:* documents and audit trails are retained indefinitely today — soft-delete only, no hard-delete path. Disclose this plainly; don't promise erasure until that's actually decided (open question, see "Deferred" below).
   - *Sub-processors to list:* Render (hosting), Neon (database), Mailgun (email delivery), Sentry (error monitoring), and SRI itself (mandatory government recipient).

   **Frontend implementation:**
   - Static pages at stable URLs — `/legal/terms`, `/legal/privacy`.
   - Signup form: a single checkbox covering both ("I agree to the [Terms] and [Privacy Policy]"), disabled submit until checked.
   - Frontend owns a "current version" string for its legal content (e.g. a date stamp like `2026-06-28`) — bump it whenever the text materially changes.
   - On submit, send that version string to the API; the API just records it, doesn't validate or interpret it.
   - On later logins, compare the tenant's stored accepted version (from `GET /v1/tenants/me`) against the frontend's current version — if they differ, prompt re-acceptance. Start as a soft banner, not a hard block.

   **API ↔ frontend contract (changes needed in `comprobify`, not this repo, but tracked here since the frontend drives the requirement):**
   - New migration — `tenants` gets two nullable columns: `legal_accepted_at TIMESTAMPTZ`, `legal_version VARCHAR` (stored as-is, API never interprets it).
   - `POST /v1/register` — new required field `termsVersion` (e.g. `"2026-06-28"`); validator rejects if missing/empty (standard `VALIDATION_FAILED`, no new error code). `registration.service.js` stores `legal_accepted_at = NOW()`, `legal_version = body.termsVersion`.
   - `GET /v1/tenants/me` — response gains `legalAcceptedAt`/`legalVersion` on the tenant object — this is how the frontend checks acceptance status for a returning user identified only by API key (no session).
   - `POST /v1/admin/tenants` (admin-created tenants) — `termsVersion` stays optional; the friends-and-family admin-onboarded path isn't self-service signup, so don't force the same validation.
   - Explicitly not building: no endpoint for "what's the current required version" — that's frontend/business content, matching the existing boundary that Comprobify doesn't own pricing/billing/ToS.

   **Deferred (not part of this item):**
   - DPA acceptance tracking — no in-app flow yet; manual/template process until there's a paying client asking for one.
   - LOPDP deletion-rights process — still an open question, intentionally not resolved here.

---

## Feature gaps

1. **Surface the actual SRI rejection reason text for RETURNED/NOT_AUTHORIZED documents** — when SRI rejects a document, its human-readable rejection message (e.g. "RUC no existe", "clave de acceso reutilizada") is sent back and stored server-side in the `sri_responses` table (`../comprobify/src/models/sri-response.model.js`), but no API endpoint exposes it. Invoice Detail's events timeline (`src/lib/event-description.ts`) can today only show the bare SRI status code (e.g. `NO_AUTORIZADO`) for a rejection, not why. Needs a new backend endpoint (e.g. `GET /v1/documents/:key/sri-responses`) in `comprobify` before the frontend can show the real reason.

2. **Gate the sidebar by role/permission, and add missing entry points for `/users` and `/api-keys`** — `navItems` in `src/components/nav.tsx` (lines 20-26) is a static list with zero role/permission filtering: every authenticated user sees Dashboard, Documents, Clients, Catalog, Issuers, and Settings regardless of what `rbac.ts`'s `ROLE_PERMISSIONS` actually grants their role. Separately, `/users` (`src/app/[locale]/users/page.tsx`, gated server-side on `users.read`) and `/api-keys` (`src/app/[locale]/api-keys/page.tsx`, gated on `apikeys.read` — both Owner/Admin only) are fully built — `inviteUserAction`/`updateUserRoleAction`/`removeUserAction`/`setUserIssuerAccessAction` and `createTenantApiKeyAction`/`revokeTenantApiKeyAction` already exist in `src/app/actions/users.ts`/`apiKeys.ts` — but neither route is linked from anywhere in the UI: not `nav.tsx`, not the `/settings` hub page. Today the only way to reach user invitation/role management or API key management is typing the URL directly. Needs: (a) filter `navItems` by `ctx.permissions` (or role) before rendering each link, and (b) add visible nav entries for Users and API Keys, gated the same way as their pages (Owner/Admin only).

3. **Add a session idle timeout / auto-logout** — `src/auth.ts:16` only sets `session.strategy: 'jwt'` with no `maxAge`, so sessions follow Auth.js defaults (30-day session, 24h JWT update age) and there is no idle-timeout, activity-tracking, or "remember me" logic anywhere in the codebase. The app holds decrypted tenant Comprobify API keys server-side and signs real SRI invoices, so a long-lived session on a shared/kiosk-style machine is a real exposure. Proposed approach: set `session.maxAge`/`jwt.maxAge` in `src/auth.ts` for a short idle window (e.g. 15–30 min) with refresh-on-activity, trading off against UX friction for users who step away and come back.
