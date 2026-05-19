# Code Flow

How a request travels through `comprobify-web`, from the browser to the Comprobify API and back.

---

## Page load (Server Component)

Example: user navigates to `/es/dashboard`.

```
1. Browser GET /es/dashboard
   │
2. Next.js middleware (src/middleware.ts)
   │  • Detects locale from URL prefix: 'es'
   │  • Sets locale header for next-intl
   │
3. Next.js App Router routing
   │  • Matches src/app/[locale]/dashboard/page.tsx
   │  • locale = 'es'
   │
4. [locale]/layout.tsx (async Server Component)
   │  • hasLocale() — validates 'es'
   │  • setRequestLocale('es')
   │  • getMessages() — loads messages/es.json
   │  • Renders: NextIntlClientProvider > QueryProvider > Nav > <main>
   │
5. dashboard/page.tsx (async Server Component)
   │  • setRequestLocale('es')
   │  • getTranslations('dashboard')
   │  • requireContext() ← src/lib/context.ts
   │      Loads: User → Tenant → Issuer (from comprobify_ctx cookie) → decrypts TenantApiKey
   │  • listDocuments({ apiKey, issuerId }) ← calls src/lib/api.ts
   │      └─► GET /api/documents (Comprobify API, server-to-server)
   │          Authorization: Bearer <tenant API key>
   │          X-Issuer-Id: <issuer's API-side id>
   │  • Returns HTML with document list pre-rendered
   │
6. Browser receives complete HTML
   │  • React hydrates interactive components (Nav active state, etc.)
   │  • No Comprobify API calls from the browser
```

---

## Form mutation (Server Action)

Example: user submits the Create Invoice form.

```
1. User fills form, clicks "Generar comprobante"
   │
2. Client Component (InvoiceForm) — React Hook Form validates locally
   │  • Zod schema catches format errors before submit
   │
3. Server Action called (createInvoiceAction in src/app/actions/invoice.ts)
   │  'use server'
   │  • Receives validated payload from the form
   │  • requireContext() ← resolves tenant, issuer, and decrypted API key
   │  • Calls createDocument({ apiKey, issuerId }, payload) ← src/lib/api.ts
   │      └─► POST /api/documents (Comprobify API, server-to-server)
   │          Authorization: Bearer <tenant API key>
   │          X-Issuer-Id: <issuer's API-side id>
   │
4a. On success:
   │  • redirect('/invoices/:accessKey') ← @/i18n/navigation
   │  • Next.js renders Invoice Detail page
   │
4b. On ApiError:
   │  • return { error: error.code }
   │  • Client Component displays t('apiError.VALIDATION_ERROR')
```

---

## Client-side polling (TanStack Query)

Example: invoice is in `RECEIVED` status, waiting for SRI authorization.

```
1. InvoiceDetailPage (Server Component) renders
   │  • document.status === 'RECEIVED'
   │  • Renders <StatusPoller accessKey={key} /> (Client Component)
   │
2. StatusPoller (Client Component)
   │  useQuery({
   │    queryKey: ['document-status', accessKey],
   │    queryFn: () => fetch('/api/documents/:key/status'),  // Next.js route
   │    refetchInterval: 5000,  // every 5 seconds
   │    enabled: status === 'RECEIVED',
   │  })
   │
3. Next.js Route Handler (src/app/api/documents/[key]/status/route.ts)
   │  • requireContext() ← resolves tenant, issuer, and decrypted API key
   │  • GET /api/documents/:key (Comprobify API, server-to-server)
   │      Authorization: Bearer <tenant API key>
   │      X-Issuer-Id: <issuer's API-side id>
   │  • Forwards response JSON to browser
   │
4. TanStack Query receives response
   │  • If status !== 'RECEIVED': sets enabled=false, stops polling
   │  • Component re-renders with new status badge
   │
5. After 2 minutes (24 polls) without change:
   │  • Shows manual "Verificar manualmente" button
   │  • Stops automatic polling
```

---

## Email verification (public page)

Example: user clicks the link in the verification email and lands on the frontend.

```
1. Browser GET /es/verify-email?token=<64-char hex>
   │
2. src/proxy.ts — verify-email is in PUBLIC_ROUTES, no auth check applied
   │
3. verify-email/page.tsx (async Server Component)
   │  • verifyEmailToken(token) ← src/lib/public-api.ts (no auth required)
   │      └─► GET /api/verify-email?token=... (Comprobify API, server-to-server)
   │          Returns: { ok: true, email: "user@example.com" }
   │  • db.user.updateMany({ where: { email }, data: { emailVerified: true } })
   │      No session needed — lookup is by email from the API response
   │  • Renders success or error card
   │
4a. On success:
   │  • Green checkmark + "Go to Settings" link
   │
4b. On ApiError (expired / invalid token):
   │  • Red X + "Request a new link from Settings" message
```

**Key design decision:** The DB update uses `updateMany` by email (not `update` by session user ID) so the page works correctly when the user clicks the link from a different device or browser where they are not logged in.

---

## Middleware chain

Every request (except `/api/`, `/_next/`, `/favicon.ico`) passes through:

```
Browser request
  └─► src/proxy.ts (next-intl — Next.js 16 renamed convention)
        ├─ Parses locale from URL prefix (/es/, /en/)
        ├─ Sets locale in request headers
        ├─ Redirects '/' to '/es' (default locale)
        └─ Continues to Next.js routing
```

---

## Key files per flow

| Flow | Files involved |
|---|---|
| Page load | `proxy.ts` → `[locale]/layout.tsx` → `page.tsx` → `context.ts` → `api.ts` |
| Form submit | `form.tsx` (client) → `actions/*.ts` (server action) → `context.ts` → `api.ts` |
| Status polling | `invoice-polling.tsx` (client) → `app/api/.../route.ts` → `context.ts` → Comprobify API |
| Navigation | `@/i18n/navigation` (Link, redirect, usePathname) |
| Translations | `getTranslations()` (server) / `useTranslations()` (client) |
