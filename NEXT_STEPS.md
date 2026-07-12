# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Feature gaps

1. **Add a session idle timeout / auto-logout** — `src/auth.ts:16` only sets `session.strategy: 'jwt'` with no `maxAge`, so sessions follow Auth.js defaults (30-day session, 24h JWT update age) and there is no idle-timeout, activity-tracking, or "remember me" logic anywhere in the codebase. The app holds decrypted tenant Comprobify API keys server-side and signs real SRI invoices, so a long-lived session on a shared/kiosk-style machine is a real exposure. Proposed approach: set `session.maxAge`/`jwt.maxAge` in `src/auth.ts` for a short idle window (e.g. 15–30 min) with refresh-on-activity, trading off against UX friction for users who step away and come back.
