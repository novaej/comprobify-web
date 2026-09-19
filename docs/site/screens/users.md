# Users Screen

**Route:** `/users`
**Component:** `src/app/[locale]/users/page.tsx`
**Type:** Server Component + Client Component

---

## Purpose

User management hub for the tenant — invite new users, view profile details and issuer assignments, edit name/role/issuers, disable/enable accounts, reset passwords, and remove users. All mutations are scoped to the authenticated tenant.

**Access:** `users.read` to view the page. All mutating actions independently require `users.manage` at the Server Action level — the page gate does not substitute for action-level enforcement (see three-layer RBAC pattern).

---

## Table

Six columns rendered by `<UserManager>` (`src/components/user-manager.tsx`):

| Column | Notes |
|--------|-------|
| Name | `firstName + lastName` if set, otherwise a dash |
| Email | Always shown |
| Issuers | Owner/Admin: "Todos" badge (implicit full access). Other roles: chips per assigned issuer (`branchCode-issuePointCode`), or "Ninguno" |
| Role | Color-coded badge per role |
| Status | Derived from `active` + `inviteStatus`: `ACTIVE` (green) / `INVITED` (amber) / `DISABLED` (red) |
| Actions | Disable/enable icon + "⋮" menu (Edit, Remove) |

---

## Invite user

A form at the top: email + role. A persistent "X of Y cupos de usuario usados" counter sits above it (`seatLimit` prop, mirrored on `/settings/api-keys`/`/settings/webhooks` — see CLAUDE.md → "Tier limits: API-vs-WEB scoping"); at the seat cap the invite button disables and shows `seatLimitReached` with a link to `/settings/billing`.

`inviteUserAction` looks up the submitted email against the local `User` table first:
- **No match** — creates a new `User` row with `inviteStatus: 'INVITED'`.
- **Matches an existing row with no `tenantId`** (an orphaned account — e.g. left behind after account recovery's `justLinked` auto-attach picked a different user, or a local data-loss incident under `User.tenant`'s `onDelete: SetNull`, see CLAUDE.md Common Mistake #68) — re-links that same `User` row to this tenant instead of erroring or creating a duplicate, clearing any stale `passwordHash` first.
- **Matches a row already on a *different* tenant** — returns `USER_BELONGS_TO_ANOTHER_TENANT`, refuses to touch it.
- **Matches a row already on *this* tenant** — returns `USER_ALREADY_IN_TENANT`.

Either way a fresh invite proceeds: mints a single-use invite token (`issueVerificationToken`, see `docs/site/screens/forgot-password.md` for the shared token mechanism) and emails a link containing it, and — best-effort — mints that role's own Comprobify API key up front (`ensureRoleApiKeyBestEffort` → `resolveApiKeyForRole`, see CLAUDE.md → "Per-role API key scopes") so it's ready before the invitee's first login. The invited user sets their password via `/complete-registration?token=...`.

---

## Edit dialog

Opens on any row (scope of editable fields depends on whether editing self or another user):

- **Name fields** (`firstName`, `lastName`) — always editable for any user
- **Role select** — shown only when editing another user; switching to/from Owner or Admin resets the issuer selection (those roles have implicit full access). Changing role also mints the new role's Comprobify API key up front, same as inviting (see above)
- **Issuer checkboxes** — shown for roles other than Owner/Admin; the list shows all active issuers in the tenant; selecting none is valid (user sees `/no-issuer-assigned` until assigned)
- **Reset password** — shown only when editing another user; opens a confirm sub-dialog; sets `passwordHash = null`, marks `inviteStatus = 'INVITED'`, sends a password-reset email

Calls `updateUserAction(userId, { firstName?, lastName?, role?, issuerIds? })`.

---

## Disable / Enable toggle

An icon button (UserX / UserCheck) per row. Optimistic UI — the toggle flips immediately and reverts on server error. Calls `toggleUserActiveAction(userId, active)`.

**Disabled user flow end-to-end:**

1. Toggle fires → `toggleUserActiveAction` sets `User.active = false`
2. On the disabled user's next page load, `requireContext()` (`src/lib/context.ts`) reads the DB row, detects `!user.active`, and calls `nextRedirect('/api/auth/signout-disabled?locale=...')` (using native `next/navigation` redirect, not the i18n one, since this is an API path without a locale prefix)
3. `/api/auth/signout-disabled` (Route Handler) calls `signOut()` — valid here because Route Handlers can clear cookies; Server Components cannot — then redirects to `/login?reason=disabled`
4. The login page detects `reason=disabled` and shows a red "Tu cuenta ha sido desactivada" banner
5. If the disabled user tries to log in again, `loginAction` pre-checks `user.active` before calling `signIn()` and returns `{ error: 'ACCOUNT_DISABLED' }` so the form shows the specific message rather than the generic "credentials incorrect"

**Guards:** `toggleUserActiveAction` rejects `CANNOT_DISABLE_SELF` when the acting user tries to disable their own account.

---

## Remove user

Available via the "⋮" menu. Shows a confirm dialog. Calls `removeUserAction(userId)`. The acting user cannot remove themselves.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/users/page.tsx` | Server Component — fetches users with `firstName`, `lastName`, `active`, `inviteStatus`, role, and issuer assignments |
| `src/components/user-manager.tsx` | Client Component — table, edit dialog, disable/enable optimistic toggle, reset password confirm dialog |
| `src/app/actions/users.ts` | `inviteUserAction`, `updateUserAction`, `toggleUserActiveAction`, `resetUserPasswordAction`, `removeUserAction`, `setUserIssuerAccessAction` |
| `src/lib/context.ts` | `requireContext()` — detects `!user.active` and routes to the sign-out handler |
| `src/app/api/auth/signout-disabled/route.ts` | Route Handler — calls `signOut()` then redirects to `/login?reason=disabled` |
| `src/app/actions/auth.ts` | `loginAction` — pre-checks `user.active` before `signIn()` and returns `ACCOUNT_DISABLED` |
| `src/app/[locale]/login/page.tsx` | Shows a destructive banner when `?reason=disabled` is present |
