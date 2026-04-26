# Frontend MVP

Plan for the Comprobify web UI. Target user: anyone who needs to issue Ecuadorian
electronic invoices — no API knowledge required.

> **Progress key:** ✅ Done · ⬜ Not started · 🔧 Partially done

---

## Goals

- ✅ You can create, send, and authorize your own invoices from a browser
- ✅ A non-developer client can do the same without touching the API
- ✅ The API product remains unchanged — the frontend is a UI layer on top of it
- ✅ Deployable for free or near-free alongside the existing API (Vercel, see Deployment)

## What this is NOT (MVP scope)

- Not a full accounting system
- No invoice templates or saved buyers (Phase 2)
- No multi-user teams or roles (Phase 2)
- No admin panel for managing other users (Phase 2)
- No payment collection from your own clients (separate product)

---

## Tech stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 16 (App Router) | ✅ |
| Language | TypeScript (strict) | ✅ |
| Styling | Tailwind CSS v4 | ✅ |
| Components | shadcn/ui (Base UI-based in v4) | ✅ |
| Forms | React Hook Form + Zod | ✅ |
| Data fetching | TanStack Query | ✅ |
| Auth | MVP: env var API key (no NextAuth needed yet) | ✅ — see ADR-003 |
| Localization | next-intl (es default, en secondary) | ✅ |

> **Note on Auth:** NextAuth is a Phase 2 concern. For MVP the API key lives in
> `COMPROBIFY_API_KEY` on the server — no login screen, no sessions. See `docs/adr/003-mvp-single-user-auth.md`.

> **Note on Next.js version:** The scaffold is Next.js **16** (not 14+). File conventions
> differ from older versions — see `CLAUDE.md` (Next.js 16 Breaking Changes section).

**Repository:** ✅ Separate repo from the API (`comprobify-web`). Deploys independently.

---

## Architecture overview

✅ **Implemented.** BFF pattern is in place.

```
┌──────────────────────────────┐    HTTP + Bearer token    ┌──────────────────────────┐
│  Comprobify Web (Next.js)    │ ────────────────────────► │  Comprobify API          │
│                              │                           │  (Node.js/Express)       │
│  ✅ Server Components        │                           │                          │
│  ✅ Server Actions           │                           │  ✅ All existing routes   │
│  ✅ API Route proxies        │                           │  ✅ PostgreSQL database   │
│  ⬜ NextAuth sessions (Ph.2) │                           │                          │
└──────────────────────────────┘                           └──────────────────────────┘
```

See `docs/adr/002-bff-pattern.md` for the full security rationale.

---

## Authentication approach

### ✅ MVP — env var API key (implemented)

No user database needed. API key is read from `COMPROBIFY_API_KEY` on the server.
All Server Components and Server Actions read it from `process.env`. No login screen.

```bash
# .env.local
COMPROBIFY_API_KEY=your-api-key-here
COMPROBIFY_API_URL=http://localhost:8080
COMPROBIFY_SANDBOX=true   # controls the yellow sandbox banner
```

See `docs/adr/003-mvp-single-user-auth.md` and `.example.env`.

### ✅ Phase 2 — multiple users (implemented)

NextAuth.js credentials provider + separate frontend database. Full design in the
original spec below:

**Frontend database** (separate PostgreSQL instance from Comprobify):

```sql
CREATE TABLE users (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  comprobify_api_key TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE buyers (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  ruc           TEXT NOT NULL,
  email         TEXT,
  address       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  description   TEXT NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL,
  tax_code      TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

Login flow:
```
Browser POSTs email + password → NextAuth authorize() → bcrypt check
  → comprobify_api_key stored in encrypted JWT (server-only, never in session object)
  → All API calls use stored key
```

**Critical trap:** Keep `apiKey` in `token` only, never in `session`. The `session`
object is sent to the browser. See `docs/site/architecture/auth.md`.

---

## Auth duality: UI users and API clients

✅ **Design complete.** The API key never reaches the browser at any point. The proxy
route (`src/app/api/documents/[key]/status/route.ts`) keeps it server-side even for
client-side polling. See `docs/adr/002-bff-pattern.md`.

### Data fetching approach

| Use case | Approach | API key visible to browser? | Status |
|---|---|---|---|
| Dashboard invoice list | Server Component | No | ✅ |
| Invoice detail page | Server Component | No | ✅ |
| Create invoice | Server Action | No | ✅ |
| Send to SRI | Server Action | No | ✅ |
| Rebuild invoice | Server Action | No | ⬜ Blocked — needs `requestPayload` in API presenter |
| Status polling (RECEIVED → AUTHORIZED) | API Route proxy + TanStack Query | No | ✅ |
| Download PDF / XML | API Route proxy | No | ✅ |

---

## Localization

✅ **Fully configured.**

- `next-intl` v4 with App Router support
- `messages/es.json` — Spanish (default, complete)
- `messages/en.json` — English (secondary, complete — no switcher in UI yet)
- Prefix routing: `/es/dashboard`, `/en/dashboard`
- Status labels mapped: `SIGNED` → "Firmado", etc.
- API error codes mapped in `apiError` namespace

> **Decided:** URL structure uses `localePrefix: 'always'` so all URLs include the
> locale prefix explicitly. Easy to change to `'as-needed'` in Phase 2.

See `docs/adr/006-next-intl-localization.md` and `docs/site/architecture/localization.md`.

---

## Screens

### 1. ✅ Login — skipped (MVP decision)

> The single env var API key means there is only one "user" (the operator).
> Login screen is not needed for MVP. Add in Phase 2 with NextAuth. See ADR-003.

### 2. 🔧 Dashboard (`/es/dashboard`)

**Page file:** `src/app/[locale]/dashboard/page.tsx`

- [x] Invoice list table (sequential, buyer, total, status badge, date) ✅
- [x] Empty state ✅
- [x] Sandbox banner ✅
- [x] "Nueva factura" button ✅
- [ ] Summary cards (total invoices, authorized this month, pending count)
- [ ] Pagination controls

### 3. ✅ Create Invoice (`/es/invoices/new`)

**Page file:** `src/app/[locale]/invoices/new/page.tsx`

- [x] Buyer section (idType selector, id, name, email, address) ✅
- [x] Line items (add/remove rows, description, quantity, unit price, discount, IVA) ✅
- [x] Payment section (method, total, term) ✅
- [x] Live totals calculation ✅
- [x] Zod schema + client-side validation ✅
- [x] Server Action → `createDocument()` → redirect to Invoice Detail ✅
- [x] API error → user-facing message ✅

### 4. ✅ Invoice Detail (`/es/invoices/:key`)

**Page file:** `src/app/[locale]/invoices/[key]/page.tsx`

- [x] Key info grid (date, total, buyer, ID) ✅
- [x] Authorization info when AUTHORIZED ✅
- [x] Access key copy button ✅
- [x] Contextual action buttons by status ✅
  - SIGNED → "Enviar al SRI"
  - RECEIVED → "Verificar autorización"
  - AUTHORIZED → Download PDF, Download XML, Resend email
- [x] Status polling (5s interval, 2min timeout) ✅
- [x] Events timeline ✅
- [ ] Line items table — blocked: API presenter doesn't return items
- [ ] Rebuild button — blocked: API presenter doesn't return `requestPayload`

### 5. 🔧 Settings (`/es/settings`)

**Page file:** `src/app/[locale]/settings/page.tsx`

- [x] Environment badge (sandbox / production) ✅
- [ ] Issuer info card — blocked: requires `GET /api/issuer/me` (not yet in API)
- [ ] API key reveal — masked input + Server Action

---

## User flows

### ✅ Create and authorize an invoice (happy path)

```
Dashboard → "Nueva factura"
  → Fill form → Submit
  → Invoice Detail (status: SIGNED)
  → Click "Enviar al SRI"
  → Invoice Detail (status: RECEIVED — polling active)
  → Auto-poll every 5s (or click "Verificar autorización")
  → Invoice Detail (status: AUTHORIZED)
  → Download PDF or XML
```

### ⬜ Handle a returned invoice

```
Invoice Detail (status: RETURNED)
  → Read SRI error messages
  → Click "Reconstruir"                   ← blocked: needs requestPayload in API
  → Form pre-filled with original data
  → Submit → Invoice Detail (SIGNED)
  → Continue with happy path
```

> **Decided:** Rebuild form will be pre-filled. The API stores the original
> `request_payload` — add it to the presenter to pre-populate form fields.

---

## API endpoints used

| Screen | Method | Endpoint | Typed in api.ts | Wired in UI |
|---|---|---|---|---|
| Dashboard | GET | `/api/documents` | ✅ | ✅ |
| Create Invoice | POST | `/api/documents` | ✅ | ✅ |
| Invoice Detail | GET | `/api/documents/:key` | ✅ | ✅ |
| Send to SRI | POST | `/api/documents/:key/send` | ✅ | ✅ |
| Authorize | GET | `/api/documents/:key/authorize` | ✅ | ✅ |
| Rebuild | POST | `/api/documents/:key/rebuild` | ✅ | ⬜ Blocked |
| Download PDF | GET | `/api/documents/:key/ride` | — | ✅ (proxy route) |
| Download XML | GET | `/api/documents/:key/xml` | — | ✅ (proxy route) |
| Events timeline | GET | `/api/documents/:key/events` | ✅ | ✅ |
| Resend email | POST | `/api/documents/:key/email-retry` | ✅ | ✅ |
| Status polling | GET | `/api/documents/:key` (via proxy) | ✅ | ✅ |

---

## What the API needs before the frontend can fully launch

1. ✅ `GET /api/documents` — paginated list.
2. ✅ Health endpoint — `GET /health`.
3. ✅ Sandbox environment — `issuer.sandbox` supported.
4. ✅ Buyer info in document responses — `buyer { id, idType, name, email }` in presenter.
5. ⬜ `GET /api/issuer/me` — needed for Settings screen (name, RUC, cert expiry, fingerprint).
6. ⬜ `requestPayload` in `GET /api/documents/:key` response — needed for Rebuild form pre-fill.

---

## Deployment

See `docs/deployment.md` for the full guide (branching strategy, Vercel setup, env vars, production checklist).

| Service | Frontend | Cost | Status |
|---|---|---|---|
| Vercel | Free tier (hobby) | $0 | ⬜ Not yet deployed |

---

## Phase 2 (after MVP works for you personally)

- ⬜ Self-service registration (sign up, pick a tier, upload P12, pay via Kushki)
- ⬜ Saved buyer address book
- ⬜ Invoice templates / drafts
- ⬜ Multi-user (invite accountant to view/download, not create)
- ⬜ Notas de crédito UI (once the API supports document type `04`)
- ⬜ Language switcher (English locale file exists — just needs a switcher UI)
- ✅ Mobile-responsive layout (hamburger drawer nav, responsive grids, scrollable tables)

---

## Open questions — resolved

| Question | Decision |
|---|---|
| Should the rebuild form be pre-filled or blank? | **Pre-filled** — use `request_payload` from the API response to populate form fields |
| Auto-polling timeout? | **2 minutes** (24 polls × 5s). Then show manual "Verificar" button. See ADR-005 |
| Language from the start? | ✅ **Spanish** — `messages/es.json` is the primary locale, always complete |
