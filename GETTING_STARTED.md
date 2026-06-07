# Getting Started

Local development setup for `comprobify-web`.

---

## Prerequisites

- **Node.js 20+** — check with `node --version`
- **PostgreSQL** — needed for the frontend database (see [Database setup](#3-database-setup) below)
- **A running Comprobify API** — see `../comprobify/GETTING_STARTED.md`

---

## 1. Clone and install

```bash
git clone <repo-url> comprobify-web
cd comprobify-web
npm install
```

---

## 2. Configure environment

```bash
cp .example.env .env.local
```

Edit `.env.local` with your values:

```bash
# PostgreSQL connection string for the frontend database
DATABASE_URL=postgresql://comprobify_web_app:changeme@localhost:5432/comprobify_web_local

# Base URL of your local Comprobify API (no trailing slash)
COMPROBIFY_API_URL=http://localhost:8080

# Full URL of this app (no trailing slash) — used to build absolute callback URLs
# sent to the API (e.g. the email verification link). Required for onboarding.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Auth secret for encrypting the session JWT — any random 32+ char string
# Generate one: openssl rand -base64 32
AUTH_SECRET=replace-me-with-a-random-string

# AES-256-GCM key for encrypting tenant API keys at rest (32-byte hex)
# Generate one: openssl rand -hex 32
ENCRYPTION_KEY=replace-me-with-64-hex-chars

# HMAC secret for signing the issuer-selection cookie (32-byte hex)
# Generate one: openssl rand -hex 32
CONTEXT_COOKIE_SECRET=replace-me-with-64-hex-chars
```

---

## 3. Database setup

The frontend has its own PostgreSQL database (separate from the Comprobify API's DB) storing users, tenants, issuers, and encrypted API keys.

### Option A — Docker (add a new database to the existing container)

If you already have the Comprobify API's Postgres container running (`postgres16`), create a new database inside it:

```bash
docker exec -it postgres16 psql -U postgres -c \
  "CREATE DATABASE comprobify_web_local;"

docker exec -it postgres16 psql -U postgres -c \
  "CREATE ROLE comprobify_web_app LOGIN PASSWORD 'changeme';"

docker exec -it postgres16 psql -U postgres -d comprobify_web_local -c "
  GRANT ALL PRIVILEGES ON DATABASE comprobify_web_local TO comprobify_web_app;
  GRANT ALL ON SCHEMA public TO PUBLIC;
  GRANT ALL ON SCHEMA public TO comprobify_web_app;
  ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO comprobify_web_app;
  ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO comprobify_web_app;
"

docker exec -it postgres16 psql -U postgres -c \
  "ALTER ROLE comprobify_web_app CREATEDB;"
```

Connection string: `postgresql://comprobify_web_app:changeme@localhost:5432/comprobify_web_local`

### Option B — Homebrew (Mac)

```bash
brew install postgresql@16
brew services start postgresql@16

psql postgres -c "CREATE DATABASE comprobify_web_local;"
psql postgres -c "CREATE ROLE comprobify_web_app LOGIN PASSWORD 'changeme';"
psql comprobify_web_local -c "
  GRANT ALL PRIVILEGES ON DATABASE comprobify_web_local TO comprobify_web_app;
  GRANT ALL ON SCHEMA public TO PUBLIC;
  GRANT ALL ON SCHEMA public TO comprobify_web_app;
  ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO comprobify_web_app;
  ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO comprobify_web_app;
"
psql postgres -c "ALTER ROLE comprobify_web_app CREATEDB;"
```

Connection string: `postgresql://comprobify_web_app:changeme@localhost/comprobify_web_local`

### Option C — Cloud (Neon, Supabase)

Create a free project on [Neon](https://neon.tech) or [Supabase](https://supabase.com). Both give you a ready-to-use connection string.

---

## 4. Run the database migration

```bash
npx prisma migrate dev --name init
```

This applies the migration in `prisma/migrations/` (creating tables for `users`, `tenants`, `tenant_api_keys`, `issuers`, `user_issuer_access`, `products`, `clients`) and generates the Prisma client. Run once per fresh database, and again whenever the schema changes.

To inspect the DB in a browser UI:

```bash
npx prisma studio
```

---

## 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The middleware redirects unauthenticated visitors to `/es/login`.

**First-time flow:**
1. Click **Regístrate** and create an account (email + password)
2. You are redirected to **/onboarding/tenant** — fill in your company details (RUC, business name, branch codes) and upload your P12 certificate
3. After setup you land on the Dashboard and can create invoices

---

## 6. Type checking

```bash
npm run type-check
```

---

## Troubleshooting

**Redirected to `/login` on every page**

Make sure `AUTH_SECRET` is defined in `.env.local`. Auth.js requires this to sign the JWT.

**`DATABASE_URL is not set` or Prisma connection error**

Check that `DATABASE_URL` in `.env.local` matches your running Postgres instance, and that the database exists. Run `npx prisma migrate dev` to create the schema.

**`ENCRYPTION_KEY must be a 32-byte hex string`**

`ENCRYPTION_KEY` is missing or wrong length. Generate one: `openssl rand -hex 32` (produces 64 hex chars).

**`CONTEXT_COOKIE_SECRET is not set`**

Add `CONTEXT_COOKIE_SECRET` to `.env.local`. Generate one: `openssl rand -hex 32`.

**Redirected to `/onboarding/tenant` after login**

Your user account has no linked tenant yet. Complete the onboarding form to create your org and first issuer.

**Issuer setup fails with "certificate invalid" or "could not locate signing key"**

The P12 file does not match the expected format, or the certificate password is wrong. Check that you are uploading the correct `.p12` file.

**Blank page / hydration error**

Usually caused by missing `setRequestLocale(locale)` in a page component. Check the server console for the error.

**`fetch` errors to the Comprobify API**

The Comprobify API is not running. Start it: `cd ../comprobify && npm start`. Check that `COMPROBIFY_API_URL` points to the correct port.

---

## Project structure

```
comprobify-web/
  prisma/
    schema.prisma           Multi-tenant schema (User, Tenant, TenantApiKey, Issuer, ...)
    migrations/             SQL migration files (applied with prisma migrate)
  prisma.config.ts          Prisma config — reads DATABASE_URL from env
  src/
    auth.ts                 Auth.js v5 config — session trimmed to { id, email }
    proxy.ts                Next.js 16 middleware — unauthenticated redirect + next-intl routing
    app/
      layout.tsx            Root layout (html/body, lang attribute)
      [locale]/
        layout.tsx          Locale layout — Nav (TenantBadge, IssuerSwitcher) + providers
        login/              Login page
        register/           Registration page (creates account only, no tenant)
        onboarding/tenant/  First-time org setup — RUC, P12, branch codes
        issuer/select/      Issuer picker (multi-issuer tenants)
        dashboard/          Invoice list page
        invoices/new/       Create invoice form page
        invoices/[key]/     Invoice detail + polling page
        documents/          Document type overview with stats
        documents/[type]/   Document list by type
        clients/            Client catalog (tenant-scoped)
        catalog/            Product catalog (tenant-scoped)
        issuers/            Issuer management — branches, document types
        api-keys/           API key list/create/revoke
        users/              User invite/role/remove management
        settings/           Tenant settings — environment badge + promotion
        verify-email/       Email token verification (public, no session required)
      api/
        auth/[...nextauth]/ Auth.js route handler
        documents/[key]/status/  Proxy route for TanStack Query polling
      actions/
        auth.ts             loginAction, registerAction, logoutAction
        onboarding.ts       bootstrapTenantAction
        context.ts          selectIssuerAction, clearContextAction
        invoice.ts          createInvoiceAction
        document.ts         sendToSriAction, authorizeAction, resendEmailAction
        tenant.ts           promoteTenantAction, updateTenantAction, resendVerificationAction
        issuers.ts          createBranchAction, addDocumentTypeAction, removeDocumentTypeAction
        apiKeys.ts          createTenantApiKeyAction, revokeTenantApiKeyAction
        users.ts            inviteUserAction, updateUserRoleAction, removeUserAction
        clients.ts          Client CRUD
        catalog.ts          Product catalog CRUD
    components/
      ui/                   shadcn/ui components (auto-generated — do not edit)
      nav.tsx               Sidebar (TenantBadge, IssuerSwitcher, UserMenu)
      login-form.tsx        Login form (client)
      register-form.tsx     Registration form (client)
      issuer-setup-form.tsx Onboarding — company/cert setup form (client)
      issuer-select-list.tsx Issuer picker list (client)
      issuer-manager.tsx    Issuer document-type management (client)
      api-key-manager.tsx   API key table with create/revoke (client)
      user-manager.tsx      User invite/role/remove table (client)
      production-promotion.tsx Promote-to-production card (client, Owner-only)
      status-badge.tsx      Document status pill
      sandbox-banner.tsx    Yellow sandbox mode banner
    lib/
      api.ts                Typed Comprobify API client (server-only; functions take ApiCtx)
      context.ts            requireContext() / requirePermission() / hasContextPermission()
      context-cookie.ts     Signed comprobify_ctx cookie helpers
      crypto.ts             AES-256-GCM encrypt/decrypt for API keys at rest
      rbac.ts               Role/Permission types + ROLE_PERMISSIONS map
      public-api.ts         Unauthenticated API calls (registerTenant, verifyEmailToken, ...)
      auth-token.ts         Thin shim — requireApiKey() wraps requireContext()
      db.ts                 Prisma client singleton
      errors.ts             ApiError + ProblemDetails
    i18n/                   next-intl config and navigation helpers
    providers/              TanStack QueryClientProvider
  messages/
    es.json                 Spanish translations (default)
    en.json                 English translations
  docs/                     Architecture docs, ADRs, guides
  .example.env              Environment variable template
```

---

## Key env vars at a glance

| Variable | Purpose | Required |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string for the frontend database | Yes |
| `COMPROBIFY_API_URL` | Base URL of the Comprobify API (no trailing slash) | Yes |
| `NEXT_PUBLIC_APP_URL` | Full URL of this app — used to build absolute callback URLs (e.g. email verification link) | Yes |
| `AUTH_SECRET` | Auth.js JWT signing secret — any random 32+ char string | Yes |
| `ENCRYPTION_KEY` | 32-byte hex — AES-256-GCM key for encrypting tenant API keys at rest | Yes |
| `CONTEXT_COOKIE_SECRET` | 32-byte hex — HMAC key for signing the issuer-selection cookie | Yes |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error monitoring — **leave unset locally**; Sentry is intentionally disabled in dev | No (set in Vercel only) |
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | Tags errors with the environment (`staging` / `production`) — **leave unset locally** | No (set in Vercel only) |
