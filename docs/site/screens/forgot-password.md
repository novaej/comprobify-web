# Forgot Password / Reset Password Screens

**Routes:** `/forgot-password`, `/reset-password`
**Components:** `src/app/[locale]/forgot-password/page.tsx`, `src/app/[locale]/reset-password/page.tsx`
**Type:** Server Component shells + Client forms (`src/components/forgot-password-form.tsx`, `src/components/reset-password-form.tsx`)

---

## Purpose

Public, unauthenticated flow letting a user with a forgotten password regain access on their own, without an Owner/Admin's help. Backed entirely by `src/app/actions/auth.ts` — `requestPasswordResetAction()` and `resetPasswordAction()` — and the generic `VerificationToken` table (`src/lib/verification-token.ts`, `purpose: 'PASSWORD_RESET'`), shared with the invite-link flow (see `docs/site/screens/users.md`); no Comprobify API call is involved, since login credentials are local to this app.

This exists because the only prior reset path, `resetUserPasswordAction` (`src/app/actions/users.ts`), is admin-triggered and explicitly blocks resetting your own password (`CANNOT_RESET_OWN_PASSWORD`) — a sole Owner who forgets their password had no way back in.

**Access:** Public. Both routes are listed in `PUBLIC_ROUTES` in `src/proxy.ts`. No session is read or required.

---

## `/forgot-password`

Single `email` field. `requestPasswordResetAction()` is deliberately anti-enumeration, mirroring `/recover-account`'s pattern: the response is always the same generic success (`AuthResult` — `null` unless the email field itself was empty), whether or not the email matches an account. It only takes an observable action — minting a token and sending an email — when the email matches a user that is `active`, `inviteStatus === 'ACTIVE'`, and already has a `passwordHash` (an invited-but-not-yet-activated user should use their invite link instead, not this flow).

The token comes from `issueVerificationToken(user.id, 'PASSWORD_RESET')` (`src/lib/verification-token.ts`) — `randomBytes(32).toString('hex')`, SHA-256-hashed before being persisted to `VerificationToken.tokenHash` (`@unique`), with a 1-hour TTL. Only the hash is ever stored — the raw token exists only in the emailed link, so a database compromise alone can't produce a usable reset link. Issuing also deletes any prior unconsumed `PASSWORD_RESET` token for that user first, so requesting a new link supersedes an earlier still-valid one. The link is `${NEXT_PUBLIC_APP_URL}/${locale}/reset-password?token=${rawToken}`, sent via `src/lib/mailgun.ts`'s `sendMail()` (the same sender `users.ts` already uses for invite/admin-reset emails) using the `email.forgotPassword` i18n namespace — kept separate from the existing `email.passwordReset` namespace, whose copy assumes an administrator initiated the reset (`{businessName}` interpolation).

---

## `/reset-password`

Reads `?token=` from the query string and, at page-load time (not deferred to submit), calls the read-only `checkResetTokenValid()` to check whether it currently resolves to a live, unexpired reset. If the token is missing, already consumed, or expired, the page renders an "invalid link" state immediately with a link back to `/forgot-password` — it does not wait for the user to fill in a form and submit it to find out. Only when the check passes does it render `ResetPasswordForm` (new password + confirm, client-side mismatch check), which calls `resetPasswordAction(token, password)`.

`resetPasswordAction` calls `consumeVerificationToken(token, 'PASSWORD_RESET')`, which atomically marks the token consumed and returns the `userId` — rejecting (generic `INVALID_OR_EXPIRED_RESET_TOKEN`, never distinguishing "no such token" from "expired" from "already used") if there's no match or expiry has passed. This is the real security check; `checkResetTokenValid()` on page load is purely a rendering decision and changes nothing about what's enforced at submit. On success it hashes the new password, signs the user in, and calls the same `postLoginRedirect()` shared with `loginAction`/`completeRegistrationAction`. The token is single-use by construction — the `consumedAt` guard means a resubmission or a re-opened link can't be consumed twice.

**Rendering while already authenticated:** unlike `/login`/`/register`/`/complete-registration`, which check `auth()` and redirect an authenticated visitor to `/dashboard` before rendering anything, `/recover-account`, `/forgot-password`, and `/reset-password` are all meant to render even when the visitor already has a session — `resetPasswordAction`'s own auto-sign-in means re-opening a just-used reset link while logged in is an expected sequence, not a mistake. That collides with `[locale]/layout.tsx`, which decides whether to wrap `{children}` in the authenticated `Nav`/`TopBar` shell before the page component ever runs — the same structural problem the marketing pages solved with `x-marketing-route`. `src/proxy.ts` forwards a second, unrelated header, `x-standalone-route` (set for exactly these three routes, kept separate from `MARKETING_ROUTES` since that one also drives the two-domain hostname-redirect logic), and `[locale]/layout.tsx` treats either header as "render standalone, skip the Nav wrap."

---

## Entry points

- `/login` — "¿Olvidaste tu contraseña?" / "Forgot your password?" link next to the password field label in `LoginForm`.

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/forgot-password/page.tsx` | Server Component shell — standalone chrome, mirrors `login`/`recover-account` |
| `src/components/forgot-password-form.tsx` | Client Component — email form, flips to a generic "check your email" state on success |
| `src/app/[locale]/reset-password/page.tsx` | Server Component shell — calls `checkResetTokenValid()` to decide between the form and an "invalid link" state at page-load time |
| `src/components/reset-password-form.tsx` | Client Component — new password + confirm form |
| `src/app/actions/auth.ts` | `requestPasswordResetAction()`, `resetPasswordAction()` (share `postLoginRedirect()` with `loginAction`/`completeRegistrationAction`), `checkResetTokenValid()` (read-only page-load check) |
| `src/lib/mailgun.ts` | `sendMail()` — the local Mailgun sender reused for the reset email |
| `src/proxy.ts` | `PUBLIC_ROUTES` includes `forgot-password` and `reset-password`; `STANDALONE_ROUTES`/`x-standalone-route` covers all three of `recover-account`/`forgot-password`/`reset-password` for the Nav-wrap escape |
| `src/app/[locale]/layout.tsx` | Reads `x-standalone-route` (alongside `x-marketing-route`) to skip the authenticated Nav shell for these routes |
| `src/lib/verification-token.ts` | `issueVerificationToken()`/`checkVerificationToken()`/`consumeVerificationToken()` — generic single-use token, shared with the invite-link flow |
| `prisma/schema.prisma` | `VerificationToken` model (`purpose`, `tokenHash` `@unique`, `expiresAt`, `consumedAt`) |
