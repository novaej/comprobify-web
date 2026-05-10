# Settings Screen

**Route:** `/es/settings`  
**Component:** `src/app/[locale]/settings/page.tsx`  
**Type:** Server Component

---

## Purpose

The Settings screen is the issuer configuration hub. It handles the full onboarding flow from initial issuer setup through email verification to production promotion, and shows the current environment status.

---

## Sections

### 1. Email verification notice

If `session.user.emailVerified` is `false`, `<EmailVerificationNotice>` renders a yellow banner above all other sections. It shows a resend button with a 60-second cooldown. Clicking resend calls `resendVerificationAction`, which:

- Builds the frontend `verificationRedirectUrl` (`/[locale]/verify-email`) from request headers
- Calls `POST /api/resend-verification` with the user's email and redirect URL
- On 409 (already verified): updates `emailVerified = true` in Prisma and hides the notice
- On 429: shows a cooldown message

### 2. Environment badge

Shows the current issuer environment:

```
🟡 Sandbox (SRI pruebas)
or
🟢 Producción (SRI real)
```

Derived from `session.user.environment` (read from the DB on every `auth()` call so it reflects the latest state).

### 3. Issuer setup form

Shown when `session.user.hasIssuer` is `false`. Fields:

| Field | Notes |
|---|---|
| RUC | 13-digit number |
| Razón social | Business name, max 300 chars |
| Nombre comercial | Optional trade name |
| Código establecimiento | 3-digit branch code |
| Punto de emisión | 3-digit issue point code |
| Certificado P12 | File upload |
| Contraseña del certificado | P12 password |
| Tipos de comprobante | Multi-select from issuer-specific document types |
| Secuenciales iniciales | Optional per-type starting sequence numbers |
| Requiere contabilidad | Boolean (affects factura XML) |

On submit → `setupIssuerAction`:
1. Calls `POST /api/admin/issuers` via `src/lib/admin-api.ts`
2. Writes `comprobifyApiKey`, `comprobifyIssuerId`, and `emailVerified` to the `users` row
3. Redirects to `/dashboard`

### 4. Production promotion

Shown when `session.user.hasIssuer` is `true` and `session.user.environment` is `'sandbox'`. Rendered by `<ProductionPromotion>`.

The "Activar producción" button is disabled until `emailVerified` is `true`. If the user attempts promotion with an unverified email, the API returns `EMAIL_NOT_VERIFIED` and a resend link appears inline.

On confirm → `promoteToProductionAction`:
1. Calls `POST /api/admin/issuers/:id/promote`
2. Creates a new production API key
3. Updates `comprobifyApiKey` and `environment` in the `users` row
4. Revalidates the settings page so the badge flips to 🟢

### 5. Issuer information card

Placeholder — waiting on `GET /api/issuer/me` endpoint (see NEXT_STEPS.md item 2). Currently shows `—` for name, RUC, cert expiry, and fingerprint.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/page.tsx` | Server Component — fetches session, renders sections |
| `src/app/actions/settings.ts` | `setupIssuerAction`, `promoteToProductionAction`, `resendVerificationAction` |
| `src/components/email-verification-notice.tsx` | Yellow resend banner (Client Component) |
| `src/components/production-promotion.tsx` | Production promotion card (Client Component) |
| `src/lib/admin-api.ts` | Admin API client — uses `COMPROBIFY_ADMIN_SECRET` |
| `src/app/[locale]/verify-email/page.tsx` | Destination for links in verification emails |
