# Settings Screen

**Route:** `/es/settings`  
**Component:** `src/app/[locale]/settings/page.tsx`  
**Type:** Server Component

---

## Purpose

Tenant settings hub — shows environment status, hosts the production promotion flow, and links to sub-pages for notification preferences and webhook management. Issuer setup has moved to `/onboarding/tenant` (first login) and `/issuers` (adding branches).

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

On confirm → `promoteTenantAction` (`src/app/actions/tenant.ts`):
1. Calls `POST /api/tenants/promote` via `src/lib/api.ts`
2. DB transaction: marks all sandbox `TenantApiKey` rows inactive, inserts new production keys (encrypted)
3. Updates `Tenant.environment = 'production'`
4. Next `requireContext()` call automatically picks up the new production key

### 4. Notification preferences card

Shown to Owner/Admin (`notifications.manage` permission). A card linking to `/settings/notifications` with a Bell icon and short description. See `docs/site/screens/notifications.md`.

### 5. Webhooks card

Shown to Owner/Admin (`webhooks.manage` permission). A card linking to `/settings/webhooks` with a Webhook icon and short description. See `docs/site/screens/webhooks.md`.

### 6. Account card

Shows the signed-in user's email address (`ctx.user.email`).

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/page.tsx` | Server Component — calls `requireContext({ skipIssuer: true })` |
| `src/app/actions/tenant.ts` | `promoteTenantAction`, `resendVerificationAction`, `updateTenantAction` |
| `src/components/email-verification-notice.tsx` | Yellow resend banner (Client Component) |
| `src/components/production-promotion.tsx` | Production promotion card (Client Component) |
| `src/app/[locale]/verify-email/page.tsx` | Destination for links in verification emails |
| `src/app/[locale]/settings/notifications/page.tsx` | Notification preferences sub-page |
| `src/app/[locale]/settings/webhooks/page.tsx` | Webhook management sub-page |
