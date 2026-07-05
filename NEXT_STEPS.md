# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Feature gaps

1. **Gate the sidebar by role/permission, and add missing entry points for `/users` and `/api-keys`** — `navItems` in `src/components/nav.tsx` (lines 20-26) is a static list with zero role/permission filtering: every authenticated user sees Dashboard, Documents, Clients, Catalog, Issuers, and Settings regardless of what `rbac.ts`'s `ROLE_PERMISSIONS` actually grants their role. Separately, `/users` (`src/app/[locale]/users/page.tsx`, gated server-side on `users.read`) and `/api-keys` (`src/app/[locale]/api-keys/page.tsx`, gated on `apikeys.read` — both Owner/Admin only) are fully built — `inviteUserAction`/`updateUserRoleAction`/`removeUserAction`/`setUserIssuerAccessAction` and `createTenantApiKeyAction`/`revokeTenantApiKeyAction` already exist in `src/app/actions/users.ts`/`apiKeys.ts` — but neither route is linked from anywhere in the UI: not `nav.tsx`, not the `/settings` hub page. Today the only way to reach user invitation/role management or API key management is typing the URL directly. Needs: (a) filter `navItems` by `ctx.permissions` (or role) before rendering each link, and (b) add visible nav entries for Users and API Keys, gated the same way as their pages (Owner/Admin only).

2. **Add a session idle timeout / auto-logout** — `src/auth.ts:16` only sets `session.strategy: 'jwt'` with no `maxAge`, so sessions follow Auth.js defaults (30-day session, 24h JWT update age) and there is no idle-timeout, activity-tracking, or "remember me" logic anywhere in the codebase. The app holds decrypted tenant Comprobify API keys server-side and signs real SRI invoices, so a long-lived session on a shared/kiosk-style machine is a real exposure. Proposed approach: set `session.maxAge`/`jwt.maxAge` in `src/auth.ts` for a short idle window (e.g. 15–30 min) with refresh-on-activity, trading off against UX friction for users who step away and come back.
