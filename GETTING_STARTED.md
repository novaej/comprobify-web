# Getting Started

Local development setup for `comprobify-web`.

---

## Prerequisites

- **Node.js 20+** — check with `node --version`
- **PostgreSQL** — needed for the user database (see [Database setup](#3-database-setup) below)
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
# PostgreSQL connection string for the frontend user database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comprobify_web

# Base URL of your local Comprobify API (no trailing slash)
COMPROBIFY_API_URL=http://localhost:8080

# Auth secret for encrypting the session JWT — any random 32+ char string
# Generate one: openssl rand -base64 32
AUTH_SECRET=replace-me-with-a-random-string
```

> **Note:** `COMPROBIFY_ADMIN_SECRET` is **not** required for normal operation.
> User registration and production promotion use the Comprobify API's public
> self-service endpoints (`POST /api/register`, `POST /api/issuers/promote`).
> The admin secret is only needed if you build operator tooling (e.g. managing
> subscription tiers). See `.example.env` for the optional variable.

---

## 3. Database setup

The frontend needs its own PostgreSQL database to store user accounts.
It is **separate** from the Comprobify API's database.

### Option A — Docker (recommended, no install required)

```bash
docker run --name comprobify-web-pg \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres
```

Connection string: `postgresql://postgres:postgres@localhost:5432/comprobify_web`

### Option B — Homebrew (Mac)

```bash
brew install postgresql@16
brew services start postgresql@16
createdb comprobify_web
```

Connection string: `postgresql://localhost/comprobify_web`

### Option C — Cloud (Neon, Supabase)

Create a free project on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
Both give you a ready-to-use connection string.

---

## 4. Run the database migration

Once `DATABASE_URL` is set in `.env.local`, create the `users` table:

```bash
npx prisma migrate dev --name init
```

This applies the migration in `prisma/migrations/` and generates the Prisma client.
You only need to run this once per fresh database (and again whenever the schema changes).

To verify the table was created:

```bash
npx prisma studio
```

Opens a browser UI at `http://localhost:5555` where you can inspect the `users` table.

---

## 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The middleware redirects unauthenticated visitors to `/es/login`.

**First-time flow:**
1. Click **Regístrate** and create an account (email + password)
2. After login you land on **Settings** — fill in your company details and upload your P12 certificate
3. Once setup is complete you are redirected to the Dashboard and can create invoices

---

## 6. Type checking

```bash
npm run type-check
```

---

## Troubleshooting

**Redirected to `/login` on every page**

The session cookie is not set. Make sure `AUTH_SECRET` is defined in `.env.local`.
Auth.js requires this to sign the JWT. Any random 32+ character string works locally.

**`DATABASE_URL is not set` or Prisma connection error**

Check that `DATABASE_URL` in `.env.local` matches your running Postgres instance,
and that the database exists. Run `npx prisma migrate dev` to create the schema.

**`COMPROBIFY_ADMIN_SECRET is not set`**

Required for issuer setup in Settings. Copy the value from your Comprobify API's
environment config and paste it into `.env.local`.

**Issuer setup fails with "certificate invalid" or "could not locate signing key"**

The P12 file does not match the expected format (Banco Central or Security Data CA),
or the certificate password is wrong. Check that you are uploading the correct `.p12` file.

**Blank page / hydration error**

Usually caused by missing `setRequestLocale(locale)` in a page component, or importing
a client component that uses server-only features. Check the server console for the error.

**`fetch` errors to the Comprobify API**

The Comprobify API is not running. Start it: `cd ../comprobify && npm start`.
Check that `COMPROBIFY_API_URL` points to the correct port.

**Navigation goes to wrong locale**

Check `src/proxy.ts` and that the path pattern in `config.matcher` matches the routes
you are testing.

---

## Project structure

```
comprobify-web/
  prisma/
    schema.prisma           Users table definition
    migrations/             SQL migration files (committed, applied with prisma migrate)
  prisma.config.ts          Prisma config — reads DATABASE_URL from env
  src/
    auth.ts                 Auth.js v5 config (providers, JWT + session callbacks)
    proxy.ts                Next.js 16 middleware — auth guard + next-intl routing
    app/
      layout.tsx            Root layout (html/body, lang attribute)
      [locale]/
        layout.tsx          Locale layout — nav (authenticated only) + providers
        login/              Login page
        register/           Registration page
        dashboard/          Invoice list page
        invoices/new/       Create invoice form page
        invoices/[key]/     Invoice detail + polling page
        settings/           Company setup + environment promotion
      api/
        auth/[...nextauth]/ Auth.js route handler
        documents/[key]/status/  Proxy route for TanStack Query polling
      actions/
        auth.ts             loginAction, registerAction
        invoice.ts          createInvoiceAction
        document.ts         sendToSriAction, authorizeAction, resendEmailAction
        settings.ts         setupIssuerAction, promoteToProductionAction
    components/
      ui/                   shadcn/ui components (auto-generated — do not edit)
      nav.tsx               Sidebar navigation + sign-out
      login-form.tsx        Login form (client)
      register-form.tsx     Registration form (client)
      issuer-setup-form.tsx Company/cert setup form (client)
      production-promotion.tsx Promote-to-production button + confirm (client)
      status-badge.tsx      Document status pill
      sandbox-banner.tsx    Yellow sandbox mode banner
    lib/
      api.ts                Typed Comprobify API client (server-only, accepts apiKey param)
      admin-api.ts          Comprobify admin API client (server-only, uses ADMIN_SECRET)
      auth-token.ts         requireApiKey() — DB lookup, server-only
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
| `DATABASE_URL` | PostgreSQL connection string for the users table | Yes |
| `COMPROBIFY_API_URL` | Base URL of the Comprobify API | Yes |
| `AUTH_SECRET` | Auth.js JWT signing secret — any random 32+ char string | Yes |
| `COMPROBIFY_ADMIN_SECRET` | Admin secret for operator tooling (not needed for normal use) | No |
