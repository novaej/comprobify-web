# Authentication Architecture

How authentication works in `comprobify-web`.

---

## Overview

Auth.js v5 (`next-auth@beta`) with a credentials provider (email + password). Sessions are JWT-based. User records live in a PostgreSQL database managed by Prisma 7.

```
Browser POSTs /api/auth/signin  (email + password)
  → Auth.js authorize() validates credentials against frontend DB
  → Auth.js encrypts session into JWT (NEXTAUTH_SECRET)
  → Set-Cookie: next-auth.session-token=<encrypted blob>  (HttpOnly, Secure, SameSite=Lax)
```

---

## Session shape

The session exposed to Server Components and Server Actions via `auth()` contains only:

```ts
{
  user: {
    id: string          // users.id (PK)
    email: string
    environment: string // 'sandbox' | 'production'
    hasIssuer: boolean  // comprobifyIssuerId IS NOT NULL
  }
}
```

**The API key is never in the session.** It lives in `users.comprobify_api_key` in the DB and is fetched server-side only via `requireApiKey()`.

---

## API key handling

```ts
// src/lib/auth-token.ts
export async function requireApiKey(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await db.user.findUnique({ where: { id: Number(session.user.id) } });
  if (!user?.comprobifyApiKey) redirect('/settings');
  return user.comprobifyApiKey;
}
```

Call `requireApiKey()` at the top of every Server Component, Server Action, and Route Handler that needs to call the Comprobify API. Pass the returned key as the first argument to functions in `src/lib/api.ts`.

**Critical:** Never add `comprobifyApiKey` to the session callbacks — that would expose it to the browser.

---

## Users table (Prisma schema excerpt)

```prisma
model User {
  id                  Int      @id @default(autoincrement())
  email               String   @unique
  password            String                         // bcrypt hash
  comprobifyApiKey    String?  @map("comprobify_api_key")
  comprobifyIssuerId  Int?     @map("comprobify_issuer_id")
  emailVerified       Boolean  @default(false) @map("email_verified")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
}
```

`comprobifyApiKey` and `comprobifyIssuerId` are written by `setupIssuerAction` after the Comprobify API creates the issuer. They are `null` until the user completes issuer setup in Settings.

---

## Email verification

After issuer setup, the Comprobify API sends a verification email with a one-time token. The user clicks the link → lands on `GET /[locale]/verify-email?token=<hex>`:

1. `verifyEmailToken(token)` calls `GET /api/verify-email?token=...` on the Comprobify API
2. The API returns `{ ok: true, email: "user@example.com" }` and marks the tenant as `ACTIVE`
3. The frontend does `db.user.updateMany({ where: { email }, data: { emailVerified: true } })`
4. No session is required — lookup is by email from the API response, so the page works from any device

`emailVerified` gates production promotion: users cannot call `promoteToProductionAction` until this flag is `true`.

The verify-email page is listed in `PUBLIC_ROUTES` in `src/proxy.ts` — Auth.js middleware does not redirect unauthenticated visitors away from it.

---

## Issuer provisioning flow

```
1. User registers account (email + password) → users row created, no issuer yet
2. User fills Settings form (RUC, cert, codes) → setupIssuerAction
     → POST /api/admin/issuers (admin API with COMPROBIFY_ADMIN_SECRET)
     → Returns issuerId + sandbox API key + isEmailVerified
     → Writes comprobifyApiKey + comprobifyIssuerId + emailVerified to users row
3. Comprobify API sends verification email (link → /[locale]/verify-email)
4. User verifies email → emailVerified = true in users row
5. User clicks "Activar producción" → promoteToProductionAction
     → POST /api/admin/issuers/:id/promote
     → Creates new production API key, updates comprobifyApiKey in users row
```

---

## Protected routes

`src/proxy.ts` wraps Auth.js middleware with two layers:

- **Public routes** (`/login`, `/register`, `/verify-email`) — no auth check
- **Settings route** — auth required; redirects to `/login` if no session
- **All other routes** — auth required; additionally redirects to `/settings` if `hasIssuer` is false (user hasn't completed setup)

```ts
const PUBLIC_ROUTES = /^\/(es|en)\/(login|register|verify-email)(\/.*)?$/;
const SETTINGS_ROUTE = /^\/(es|en)\/settings(\/.*)?$/;
```
