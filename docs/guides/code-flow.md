# Code Flow

How a request travels through `comprobify-web`, from the browser to the Comprobify API and back.

---

## Page load (Server Component)

Example: user navigates to `/es/dashboard`.

```
1. Browser GET /es/dashboard
   │
2. Next.js proxy (src/proxy.ts)
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

## Webhook notification delivery

Example: Comprobify API fires a `DOCUMENT_AUTHORIZED` event.

```
1. Comprobify API POST /api/webhooks/receive
   │  Headers: X-Comprobify-Timestamp, X-Comprobify-Signature
   │  Body: { type, tenantId, issuerId, notification: { id, type, severity, title, message, ... } }
   │
2. src/app/api/webhooks/receive/route.ts (Route Handler)
   │  • request.text()  ← raw body captured FIRST (JSON.parse after)
   │  • Lookup WebhookEndpoint in DB by tenantId → decrypt secret
   │  • HMAC-SHA256(secret, timestamp + "." + rawBody) === signature?  → 401 if not
   │  • db.notification.upsert(tenantId, apiNotificationId) — idempotent
   │  • fanOutReads(): create NotificationRead for Owner/Admin and per-issuer roles
   │  • 200 OK
   │
3. Next page load (or bell poll)
   │  • [locale]/layout.tsx fetches unread notifications from DB
   │  • NotificationBell badge updates; CertExpiryBanner appears if CERT_* unread
```

**Catch-up path (missed webhooks):** `<NotificationSync />` fires `catchUpNotificationsAction()`
on every authenticated page mount → `GET /api/notifications` → upserts any notifications the
webhook may have missed during downtime.

---

## Complete registration (invited user)

Example: team member clicks email invite link and opens the app.

```
1. Owner invites user via /users screen → inviteUserAction
   │  • db.user.create({ inviteStatus: 'INVITED', passwordHash: null })
   │  • issueVerificationToken(userId, 'INVITE') — single-use, 7-day TTL
   │  • sendInviteEmail() (this app's own Mailgun sender, not the Comprobify API)
   │    with link /complete-registration?token=<raw token>
   │
2. User clicks link → Browser GET /es/complete-registration?token=<token>
   │
3. src/proxy.ts — complete-registration is in PUBLIC_ROUTES, no auth redirect
   │
4. complete-registration/page.tsx (Server Component)
   │  • checkInviteToken(token) — read-only, does not consume; resolves email for display
   │  • Authenticated user → redirect /dashboard (already registered)
   │  • Invalid/expired/missing token → "invalid link" state, no form rendered
   │  • Renders <CompleteRegistrationForm token={token} email={email} />
   │
5. User fills password + confirm, clicks submit
   │
6. completeRegistrationAction(token, 'password')
   │  'use server'
   │  • consumeVerificationToken(token, 'INVITE') — single-use, resolves userId
   │  • checks inviteStatus === 'INVITED' (not passwordHash — see CLAUDE.md #50)
   │  • bcrypt.hash(password) → db.user.update({ passwordHash, inviteStatus: 'ACTIVE' })
   │  • signIn('credentials', { email: user.email, password })
   │  • postLoginRedirect() → /onboarding/tenant | /dashboard | /issuer/select
   │
7. Login flow (returning invited user — has password now)
   │  • loginAction pre-checks inviteStatus before signIn
   │  • INVITED + no passwordHash → mints a fresh invite token, redirects to
   │    /complete-registration?token=... (supersedes any earlier unconsumed token)
   │  • ACTIVE → normal signIn → postLoginRedirect
```

---

## Middleware chain (complete)

Every request (except `/api/`, `/_next/`, `/favicon.ico`) passes through:

```
Browser request
  └─► src/proxy.ts (next-intl — Next.js 16 renamed convention)
        ├─ Parses locale from URL prefix (/es/, /en/)
        ├─ Sets locale in request headers
        ├─ Redirects '/' to '/es' (default locale)
        ├─ PUBLIC_ROUTES: login, register, verify-email, onboarding/*, complete-registration
        │    └─► No auth check applied
        └─ All other routes: unauthenticated → redirect /login
              Then continues to Next.js routing
```

---

## Key files per flow

| Flow | Files involved |
|---|---|
| Page load | `proxy.ts` → `[locale]/layout.tsx` → `page.tsx` → `context.ts` → `api.ts` |
| Form submit | `form.tsx` (client) → `actions/*.ts` (server action) → `context.ts` → `api.ts` |
| Status polling | `invoice-polling.tsx` (client) → `app/api/.../route.ts` → `context.ts` → Comprobify API |
| Webhook receive | `app/api/webhooks/receive/route.ts` → HMAC verify → `db.notification.upsert` → fan-out reads |
| Notifications (catch-up) | `notification-sync.tsx` (client) → `catchUpNotificationsAction` → `GET /api/notifications` → upsert |
| Complete registration | `verification-token.ts` (`issueVerificationToken`) → email link → `complete-registration/page.tsx` (`checkInviteToken`) → `CompleteRegistrationForm` → `completeRegistrationAction` (`consumeVerificationToken`) → `signIn` |
| Navigation | `@/i18n/navigation` (Link, redirect, usePathname) |
| Translations | `getTranslations()` (server) / `useTranslations()` (client) |
