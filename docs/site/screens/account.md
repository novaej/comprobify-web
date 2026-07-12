# Account Settings Screen

**Route:** `/settings/account`
**Component:** `src/app/[locale]/settings/account/page.tsx`
**Type:** Server Component + Client Component

---

## Purpose

User-level profile management — any authenticated user can update their display name and change their own password. Not to be confused with tenant-level settings at `/settings`.

**Access:** Any authenticated user with a tenant (`requireContext({ skipIssuer: true })`). No special permission required — this page manages the signed-in user's own identity, not tenant resources.

---

## Sections

### Profile form

Fields pre-filled from `ctx.user.firstName` / `ctx.user.lastName`:

- `firstName` — given name (optional)
- `lastName` — family name (optional)
- `email` — read-only; shown for reference but not editable here

Calls `updateProfileAction({ firstName, lastName })` (`src/app/actions/account.ts`), which updates `User.firstName` / `User.lastName` for the signed-in user and calls `revalidatePath('/', 'layout')` so the sidebar avatar and display name reflect the change immediately.

### Password form

Three fields:

- Current password — verified server-side against the stored `bcrypt` hash
- New password — minimum 8 characters
- Confirm new password — must match (client-side Zod validation)

Calls `changePasswordAction({ currentPassword, newPassword })` (`src/app/actions/account.ts`). Returns `WRONG_CURRENT_PASSWORD` if verification fails, `PASSWORD_TOO_SHORT` if the new password is too short.

---

## Back navigation

`PageHeader` with `backHref="/settings"` — single parent, hardcoded.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/account/page.tsx` | Server Component — reads `ctx.user` and passes `firstName`, `lastName`, `email` as props |
| `src/components/account-settings.tsx` | Client Component — profile form + password change form (React Hook Form + Zod) |
| `src/app/actions/account.ts` | `updateProfileAction`, `changePasswordAction` — both gated on the signed-in user's own row |
