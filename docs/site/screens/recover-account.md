# Recover Account Screen

**Route:** `/recover-account`
**Component:** `src/app/[locale]/recover-account/page.tsx`
**Type:** Server Component shell + Client form (`src/components/recover-account-form.tsx`)

---

## Purpose

Public, unauthenticated page for regaining access to a lost Comprobify API key, backed by `POST /v1/recover` (`recoverAccount()` in `src/lib/public-api.ts`, wrapped by the `recoverAccountAction()` Server Action in `src/app/actions/recovery.ts`).

This exists because `POST /v1/register` no longer doubles as an implicit recovery mechanism — it now always rejects an already-registered email with `409 CONFLICT`. `POST /v1/recover` is the dedicated replacement, and it's deliberately anti-enumeration: submitting an unregistered email, an account with no issuer, or a mismatched certificate all return the exact same generic `200` response. Only a P12 certificate that actually matches the one on file for that account — the same ownership bar fresh registration accepts — gets an observable result (a freshly issued API key for the tenant's actual current environment, sandbox or production).

**Access:** Public. Listed in `PUBLIC_ROUTES` in `src/proxy.ts`. No session is read or required anywhere in this flow — a matching certificate is treated as sufficient proof of ownership on its own, mirroring the trust bar the API itself applies.

---

## Form fields

- `email` — the account's registered email
- `cert` — the P12 certificate file used at registration (`.p12`/`.pfx`)
- `certPassword` — optional, only needed if the P12 has one

---

## Result states

`recoverAccountAction()` returns one of:

1. **`{ matched: false }`** — the generic anti-enumeration outcome. Rendered as a neutral message; deliberately worded so it reads the same whether the email doesn't exist, the account has no issuer, or the certificate didn't match.
2. **`{ matched: true, linked: true }`** — the recovered `apiTenantId` matched a `Tenant` row already linked in this app's local database. The API just revoked whichever key(s) it had for that environment and minted a new one, so the action also refreshes the local `TenantApiKey` row: revokes the previously-active row(s) for that tenant + environment and inserts the freshly recovered key (looked up via a follow-up `listTenantApiKeys()` call, since `POST /v1/recover` — like `POST /v1/keys` — only returns the plaintext token, not its API-side id; see CLAUDE.md Common Mistake #18). User is told to log in.
3. **`{ matched: true, linked: false, apiKey, environment }`** — a real match, but no local `Tenant` row exists for that `apiTenantId` (never linked to this app, or a previous link attempt never finished). The recovered key is shown once (copy-once pattern, same UI as `api-key-manager.tsx`'s created-key display), with instructions to log in (or register a web account) and use the existing "Link existing account" tab on `/onboarding/tenant`, which already handles Tenant + Issuer creation and attaching the signed-in user in one transaction.

**Why case 3 doesn't create a `Tenant` row itself:** doing so here — before any user is attached — would make `linkExistingTenantAction`'s `apiTenantId` uniqueness check treat the tenant as already linked, blocking the real linking step. Handing back the key and reusing the existing, already-transactional linking flow avoids introducing an orphan-tenant state that no other code path in this app expects.

---

## Errors

Real `ApiError`s (not the generic anti-enumeration response) are surfaced via the shared `apiError` i18n namespace: `EMAIL_REQUIRED`/`CERT_REQUIRED` (local validation, checked before calling the API), `VALIDATION_FAILED`, `CERTIFICATE_INVALID`/`CERTIFICATE_PASSWORD_INVALID`/`CERTIFICATE_KEY_NOT_FOUND`/`CERTIFICATE_EXPIRED` (cert parsing failures — these happen before any account lookup on the API side, so they don't correlate with account existence either), `ACCOUNT_SUSPENDED` (only ever revealed once a matching certificate already proved ownership), and `TOO_MANY_REQUESTS` (rate limit shared with `/v1/register` and `/v1/resend-verification` — 5/hour/IP).

---

## Entry points

- `/login` — "¿Perdiste tu llave API?" / "Lost your API key?" link below the register/support links.

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/recover-account/page.tsx` | Server Component shell — standalone chrome, mirrors `login`/`register` |
| `src/components/recover-account-form.tsx` | Client Component — form + result states |
| `src/app/actions/recovery.ts` | `recoverAccountAction()` — calls the public API, then repairs or defers local linking |
| `src/lib/public-api.ts` | `recoverAccount()` — typed `POST /v1/recover` call |
| `src/proxy.ts` | `PUBLIC_ROUTES` includes `recover-account` |
