# Settings Screen

**Route:** `/es/settings`
**Component:** `src/app/[locale]/settings/page.tsx`
**Type:** Server Component

---

## Purpose

Tenant settings hub — shows environment status, hosts the production promotion flow, and links to sub-pages for billing, notification preferences, and webhook management. Issuer setup has moved to `/onboarding/tenant` (first login) and `/issuers` (adding branches).

Access: all authenticated users with a tenant. Calls `requireContext({ skipIssuer: true })` so it is accessible even when no issuer cookie is set.

---

## Sections

### 1. Email verification notice

Shown when `ctx.user.emailVerified` is `false`. `<EmailVerificationNotice>` renders a yellow banner with a resend button (60-second cooldown). Clicking resend calls `resendVerificationAction` (`src/app/actions/tenant.ts`), which calls `POST /api/resend-verification` via `src/lib/public-api.ts`.

### 2. Environment badge

Shows the current tenant environment derived from `ctx.tenant.environment`:

```
🟡 Sandbox (SRI pruebas)
or
🟢 Producción (SRI real)
```

### 3. Production promotion

Shown when the tenant has at least one issuer and `ctx.tenant.environment === 'sandbox'`. Rendered by `<ProductionPromotion>`. Gated by `tenant.promote` permission (Owner-only).

The "Activar producción" button is disabled until `ctx.user.emailVerified` is `true`.

The confirm step's plan section has two states:
- **No subscription yet** — a tier `Select` (FREE + the live `listTiers()` catalog), pre-filled from `Tenant.intendedTier`/`intendedBillingInterval` if the tenant picked a plan on `/pricing` during registration (editable before confirming), plus a monthly/yearly toggle and a live price/quota summary line.
- **A subscription is already `ACTIVE`** (started via `/settings/billing`'s "Subscribe" card while still in sandbox) — the picker is replaced by a note naming the active tier with a link to `/settings/billing`, since `comprobify`'s `promote()` ignores any `tier`/`billingInterval` passed once a subscription exists. `settings/page.tsx` determines this by calling `getMySubscriptions()` and checking for an `ACTIVE` row.

On confirm → `promoteTenantAction(initialSequentials, tier?, billingInterval?)` (`src/app/actions/tenant.ts`):
1. Calls `POST /v1/tenants/promote` via `src/lib/api.ts`, passing `tier`/`billingInterval` only when no subscription is already active
2. DB transaction: marks all sandbox `TenantApiKey` rows inactive, inserts new production keys (encrypted), flips `Tenant.environment = 'production'`, clears `intendedTier`/`intendedBillingInterval` (superseded by the real subscription), and caches any returned `bankTransfer` onto `Tenant.pendingBankTransfer`
3. If the response included a `subscription` (a tier was requested or already active), redirects to `/settings/billing` instead of staying on this page
4. Next `requireContext()` call automatically picks up the new production key

### 4. Security card

Shown when `ctx.permissions.has('tenant.manage')` (Owner-only). `<SessionTimeoutSettings>` — a number input (minutes, bounded 5–480) for `Tenant.sessionIdleTimeoutMinutes`, with Save and (when a custom value is set) "Use default" buttons. `null` in the database means "using `DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES`" (30 minutes) — the card shows which state it's in. Saves via `updateTenantAction({ sessionIdleTimeoutMinutes })`; the actual enforcement (idle sessions get signed out) lives in `src/auth.ts`'s `jwt` callback, not here — see CLAUDE.md's "Per-tenant session idle timeout" pattern. Applies tenant-wide, to every user's session, not just the Owner's own.

### 5. Billing card

Shown to anyone with `billing.read` permission. A card linking to `/settings/billing` with a CreditCard icon and short description. See `docs/site/screens/billing.md`.

### 6. Notification preferences card

Shown to Owner/Admin (`notifications.manage` permission). A card linking to `/settings/notifications` with a Bell icon and short description. See `docs/site/screens/notifications.md`.

### 7. Webhooks card

Shown to Owner/Admin (`webhooks.manage` permission). A card linking to `/settings/webhooks` with a Webhook icon and short description. See `docs/site/screens/webhooks.md`.

### 8. Account card

A clickable card linking to `/settings/account`. Shows `firstName + lastName` (if set) alongside the signed-in user's email. Any authenticated user can access this — no special permission required. See `docs/site/screens/account.md`.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/page.tsx` | Server Component — calls `requireContext({ skipIssuer: true })`, `listTiers()`, and `getMySubscriptions()` (sandbox only) to detect an already-active subscription |
| `src/app/actions/tenant.ts` | `promoteTenantAction`, `resendVerificationAction`, `updateTenantAction` (partial update, incl. `sessionIdleTimeoutMinutes`) |
| `src/components/email-verification-notice.tsx` | Yellow resend banner (Client Component) |
| `src/components/production-promotion.tsx` | Production promotion card (Client Component) |
| `src/components/session-timeout-settings.tsx` | Security card's idle-timeout form (Client Component) |
| `src/lib/session-timeout.ts` | Idle-timeout constants + validation, shared with `src/auth.ts`'s enforcement |
| `src/lib/subscription-tiers.ts` | `PaidTier`/`BillingInterval` types shared with the billing screen |
| `src/app/[locale]/verify-email/page.tsx` | Destination for links in verification emails |
| `src/app/[locale]/settings/billing/page.tsx` | Subscription/payment management sub-page — see `docs/site/screens/billing.md` |
| `src/app/[locale]/settings/notifications/page.tsx` | Notification preferences sub-page |
| `src/app/[locale]/settings/webhooks/page.tsx` | Webhook management sub-page |
| `src/app/[locale]/settings/account/page.tsx` | User profile + password change sub-page — see `docs/site/screens/account.md` |
