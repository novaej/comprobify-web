# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Feature gaps

1. **Add a session idle timeout / auto-logout** — `src/auth.ts:16` only sets `session.strategy: 'jwt'` with no `maxAge`, so sessions follow Auth.js defaults (30-day session, 24h JWT update age) and there is no idle-timeout, activity-tracking, or "remember me" logic anywhere in the codebase. The app holds decrypted tenant Comprobify API keys server-side and signs real SRI invoices, so a long-lived session on a shared/kiosk-style machine is a real exposure. Proposed approach: set `session.maxAge`/`jwt.maxAge` in `src/auth.ts` for a short idle window (e.g. 15–30 min) with refresh-on-activity, trading off against UX friction for users who step away and come back.

2. **Add a self-service "forgot password" flow** — the only password reset path today is `resetUserPasswordAction` (`src/app/actions/users.ts:237`), which is admin-triggered: an Owner/Admin resets *someone else's* password and it explicitly blocks resetting your own (`CANNOT_RESET_OWN_PASSWORD`). `/login` has no "forgot password?" link at all. This leaves a sole Owner with no way back in if they forget their password — there's nobody else with `users.manage` to reset them. Proposed approach: a token-based flow mirroring the existing email-verification pattern rather than reusing the admin path — new `passwordResetToken`/`passwordResetTokenExpiresAt` columns on `User`, a "forgot password?" link on `/login`, an emailed link to a new `/reset-password` page, and a Server Action that validates the token/expiry before setting a new `passwordHash`.
