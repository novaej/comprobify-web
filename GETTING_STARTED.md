# Getting Started

Local development setup for `comprobify-web`.

---

## Prerequisites

- Node.js 20+ (check with `node --version`)
- A running Comprobify API instance (see `../comprobify/GETTING_STARTED.md`)
- A valid Comprobify API key (create one via the admin API or use a test key)

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

Edit `.env.local`:

```bash
# URL of your local Comprobify API (or staging/production URL)
COMPROBIFY_API_URL=http://localhost:8080

# API key from your Comprobify issuer
# Create one: POST /api/admin/api-keys  (requires ADMIN_SECRET)
COMPROBIFY_API_KEY=your-api-key-here

# Set to "true" if the API key belongs to a sandbox issuer
COMPROBIFY_SANDBOX=true

# Not used in MVP (required only when NextAuth is added in Phase 2)
# NEXTAUTH_SECRET=...
```

---

## 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The middleware will redirect `/` to `/es/dashboard` (default locale).

---

## 4. Type checking

```bash
npm run type-check
```

---

## Troubleshooting

**Blank page / hydration error**

Usually caused by missing `setRequestLocale(locale)` in a page component, or importing a Client Component module that uses server-only features. Check the server console for the actual error.

**`COMPROBIFY_API_KEY is not set`**

The `.env.local` file is missing or `COMPROBIFY_API_KEY` is not set. Copy `.example.env` and fill in the values.

**`fetch` errors in the dev console**

The Comprobify API is not running. Start it first: `cd ../comprobify && npm start`.

**Navigation goes to wrong locale**

Ensure the next-intl middleware is running. Check `src/middleware.ts` and that the path pattern in `config.matcher` matches the routes you're testing.

---

## Project structure

```
comprobify-web/
  src/
    app/
      layout.tsx              Root layout (html/body, lang attribute)
      [locale]/
        layout.tsx            Locale layout (providers, nav)
        dashboard/            Invoice list page
        invoices/new/         Create invoice form page
        invoices/[key]/       Invoice detail page
        settings/             Settings page
      api/documents/[key]/status/  Proxy route for polling
    components/
      ui/                     shadcn components (auto-generated)
      nav.tsx, status-badge.tsx, sandbox-banner.tsx
    lib/
      api.ts                  Typed API client (server-only)
      errors.ts               ApiError + ProblemDetails
    i18n/                     next-intl config and navigation helpers
    providers/                TanStack QueryClientProvider
    middleware.ts             Locale routing
  messages/
    es.json                   Spanish translations
    en.json                   English translations
  docs/                       Architecture docs, ADRs, guides
  .example.env                Environment variable template
```
