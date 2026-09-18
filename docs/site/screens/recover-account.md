# Recover Account Screen

**Route:** `/recover-account`
**Component:** `src/app/[locale]/recover-account/page.tsx`
**Type:** Server Component shell + Client form (`src/components/recover-account-form.tsx`)

---

## Purpose

Public, entirely session-independent page for fixing a broken local link between a comprobify-web login and its Comprobify tenant, backed by `POST /v1/recover` (`recoverAccount()` in `src/lib/public-api.ts`, wrapped by `recoverAccountAction()` in `src/app/actions/recovery.ts`).

Despite the name, this isn't "recover a lost API key" — every key comprobify-web mints is `is_reserved` (comprobify migration 102) and never shown to a human, so there's no plaintext key for anyone to lose. What this actually fixes is the *link* itself: never established (a tenant registered but somehow never attached to a comprobify-web login), or lost on comprobify-web's own side (e.g. a local data-loss incident — see CLAUDE.md Common Mistake #68).

The endpoint is deliberately anti-enumeration: submitting an unregistered email, an account with no issuer, or a mismatched certificate all return the identical generic `200` response. Only a P12 certificate that actually matches the one on file — the same ownership bar fresh registration accepts — gets an observable result.

**Access:** Public. Listed in `PUBLIC_ROUTES` and `STANDALONE_ROUTES` in `src/proxy.ts`. The page force-logs-out any session on load (`ForceHardRedirect` → `/api/auth/signout-recover`) — the whole flow is session-independent, so any session present is unrelated to what this page does and would otherwise confuse "back to login" navigation.

---

## Form fields

- `email` — the tenant's registered email (also used as the local lookup key — see below)
- `cert` — the P12 certificate file used at registration (`.p12`/`.pfx`)
- `certPassword` — optional, only needed if the P12 has one

---

## How matching works

Before calling the API, `recoverAccountAction()` looks up the local `User` table by the *submitted* email (case-insensitive) — not any session. That lookup does two things:

1. Its `tenantId` (null or not) becomes the `alreadyLinked` hint sent to `POST /v1/recover` — telling the API whether to skip its own rotate-and-reissue side effect on a match (see below).
2. For a genuinely-unlinked match, it's the login the recovered tenant gets attached to.

## Result states

`recoverAccountAction()` returns one of:

1. **`{ matched: false }`** — the generic anti-enumeration outcome.
2. **`{ matched: true, outcome: 'alreadyLinked' }`** — a real match, and the local hint told the API this tenant is already linked. The API confirmed the match and did nothing else (no rotation, no forced re-verification). Shown with a message pointing at `/forgot-password` — recovering the *link* isn't the same as recovering a *login*, so this is the moment to redirect toward the right tool if that's what's actually needed.
3. **`{ matched: true, outcome: 'resynced' }`** (rare fallback) — a real match, but the local hint missed (e.g. the tenant is linked under a different login email than the one typed here), so the API ran its full rotate-and-reissue path. The local `TenantApiKey` mirror is now genuinely stale, so the action revokes the previously-active row(s) for that tenant + environment and inserts the freshly recovered key (resolved via `listAdminApiKeys()`, since the key is reserved and invisible to the tenant-facing listing). Shown with a message mentioning the forced re-verification, since it actually happened.
4. **`{ matched: true, outcome: 'justLinked' }`** — no local `Tenant` row existed for the recovered `apiTenantId`. The local `User` found by the submitted email (must have `tenantId: null`) gets a freshly-created Tenant/Issuer(s)/TenantApiKey set attached, as Owner — **without being signed in**: a certificate proves tenant ownership, not knowledge of that login's password. Shown with a message directing them to log in.

If no local `User` matches the submitted email at all for the `justLinked` path, the result is `{ error: 'RECOVERY_ACCOUNT_NOT_FOUND' }` — should not be reachable in practice, since comprobify-web is the only path that can ever create a tenant at the API and always creates the local User+Tenant link together (see CLAUDE.md Common Mistake #68); Sentry-captured as a genuine anomaly when hit.

No outcome ever redirects — every result renders inline with a "Volver a iniciar sesión" button (`logoutAction`, always available regardless of whether a session exists).

---

## Errors

Real `ApiError`s (not the generic anti-enumeration response) are surfaced via the shared `apiError` i18n namespace: `EMAIL_REQUIRED`/`CERT_REQUIRED` (local validation, checked before calling the API), `VALIDATION_FAILED`, `CERTIFICATE_INVALID`/`CERTIFICATE_PASSWORD_INVALID`/`CERTIFICATE_KEY_NOT_FOUND`/`CERTIFICATE_EXPIRED` (cert parsing failures — happen before any account lookup on the API side, so they don't correlate with account existence either), `ACCOUNT_SUSPENDED` (only ever revealed once a matching certificate already proved ownership), `RECOVERY_ACCOUNT_NOT_FOUND` (see above), `TENANT_ALREADY_EXISTS` (the matched local `User` already has a *different* tenant), `NO_ISSUERS_FOUND`, `DB_WRITE_FAILED`, and `TOO_MANY_REQUESTS` (comprobify's dedicated `recoverLimiter` — 5/hour/IP, independent from register/resend-verification's own limiters as of comprobify commit 83c54ed).

---

## Entry points

- `/login` — "¿Tienes un usuario pero no conectaste tu empresa?" / "Have a login but haven't connected your company?" link.
- `/onboarding/tenant` — `IssuerSetupForm` shows a link alongside a `409 CONFLICT` registration error (RUC/email already registered elsewhere).

Both work regardless of auth state — this page never requires being logged in.

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/recover-account/page.tsx` | Server Component shell — standalone chrome, force-logs-out any session on load |
| `src/components/recover-account-form.tsx` | Client Component — form + four result states, no redirects |
| `src/app/actions/recovery.ts` | `recoverAccountAction()` — resolves the local User by submitted email, calls the public API, branches into the three real-match outcomes |
| `src/lib/public-api.ts` | `recoverAccount()` — typed `POST /v1/recover` call, sends `alreadyLinked` |
| `src/components/force-hard-redirect.tsx` | Forces a real browser navigation for the page-load logout bounce |
| `src/app/api/auth/signout-recover/route.ts` | Route Handler — the actual `signOut()` call |
| `src/proxy.ts` | `PUBLIC_ROUTES`/`STANDALONE_ROUTES` both include `recover-account` |
