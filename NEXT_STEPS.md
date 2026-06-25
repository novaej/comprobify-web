# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Feature gaps

1. **Surface the actual SRI rejection reason text for RETURNED/NOT_AUTHORIZED documents** — when SRI rejects a document, its human-readable rejection message (e.g. "RUC no existe", "clave de acceso reutilizada") is sent back and stored server-side in the `sri_responses` table (`../comprobify/src/models/sri-response.model.js`), but no API endpoint exposes it. Invoice Detail's events timeline (`src/lib/event-description.ts`) can today only show the bare SRI status code (e.g. `NO_AUTORIZADO`) for a rejection, not why. Needs a new backend endpoint (e.g. `GET /v1/documents/:key/sri-responses`) in `comprobify` before the frontend can show the real reason.

2. **Gate the sidebar by role/permission, and add missing entry points for `/users` and `/api-keys`** — `navItems` in `src/components/nav.tsx` (lines 20-26) is a static list with zero role/permission filtering: every authenticated user sees Dashboard, Documents, Clients, Catalog, Issuers, and Settings regardless of what `rbac.ts`'s `ROLE_PERMISSIONS` actually grants their role. Separately, `/users` (`src/app/[locale]/users/page.tsx`, gated server-side on `users.read`) and `/api-keys` (`src/app/[locale]/api-keys/page.tsx`, gated on `apikeys.read` — both Owner/Admin only) are fully built — `inviteUserAction`/`updateUserRoleAction`/`removeUserAction`/`setUserIssuerAccessAction` and `createTenantApiKeyAction`/`revokeTenantApiKeyAction` already exist in `src/app/actions/users.ts`/`apiKeys.ts` — but neither route is linked from anywhere in the UI: not `nav.tsx`, not the `/settings` hub page. Today the only way to reach user invitation/role management or API key management is typing the URL directly. Needs: (a) filter `navItems` by `ctx.permissions` (or role) before rendering each link, and (b) add visible nav entries for Users and API Keys, gated the same way as their pages (Owner/Admin only).
