# comprobify-web

Next.js 16 frontend for the [Comprobify](../comprobify/) electronic invoice API. Lets non-technical users create, send, and authorize Ecuadorian electronic invoices (facturas electrónicas SRI) from a browser — plus manage tenants, issuers, billing, and users, all without touching the API directly.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query (client polling only) |
| Localization | next-intl (Spanish default) |
| Auth | Auth.js v5 (next-auth@beta) — JWT session, RBAC with 5 roles |
| Monitoring | Sentry (`@sentry/nextjs`) |

## Architecture

```
Browser ──────────────────► Next.js (this repo)
        (no API key visible)       │  reads API key from encrypted DB column
                                   ▼
                            Comprobify API
                     (Authorization: Bearer <api-key>)
```

All Comprobify API calls happen server-side (BFF pattern). The tenant's API key is never sent to the browser. See [docs/adr/002-bff-pattern.md](docs/adr/002-bff-pattern.md).

## Screens

| Route | Screen |
|---|---|
| `/es` | Marketing landing page |
| `/es/pricing` | Pricing (live tier catalog) |
| `/es/dashboard` | KPI summary + recent documents |
| `/es/documents/:type` | Paginated document list per SRI document type |
| `/es/invoices/new` | Create/correct invoice form |
| `/es/credit-notes/new` | Create/correct credit note (Nota de Crédito) form |
| `/es/invoices/:key` | Document detail — status, events timeline, PDF preview, actions |
| `/es/clients` | Client catalog CRUD |
| `/es/catalog` | Product catalog CRUD |
| `/es/onboarding/tenant` | First-time org setup (create or link tenant) |
| `/es/issuers` | Issuer management — branches, issue points, certs, logos |
| `/es/issuers/:id` | Issuer edit — trade name, address, cert, sequentials |
| `/es/api-keys` | API key list/create/revoke |
| `/es/users` | User invite/role/issuer-access management |
| `/es/settings` | Tenant settings — environment badge + production promotion |
| `/es/settings/billing` | Subscription — plan, payment proof upload, history |
| `/es/settings/notifications` | Notification preferences |
| `/es/settings/webhooks` | Webhook endpoint management |
| `/es/settings/account` | Own profile + password change |
| `/es/admin/*` | Super admin panel — tenants, payment review, legal agreements |

## Getting started

See [GETTING_STARTED.md](GETTING_STARTED.md).

## Documentation

| Resource | Location |
|---|---|
| Setup guide | [GETTING_STARTED.md](GETTING_STARTED.md) |
| Architecture decisions | [docs/adr/](docs/adr/) |
| Code flow walkthrough | [docs/guides/code-flow.md](docs/guides/code-flow.md) |
| Coding guidelines | [docs/guides/coding-guidelines.md](docs/guides/coding-guidelines.md) |
| Documentation checklist | [docs/guides/documentation-checklist.md](docs/guides/documentation-checklist.md) |
| Deployment / env vars | [docs/deployment.md](docs/deployment.md) |
| Screen specs | [docs/site/screens/](docs/site/screens/) |
| Architecture deep-dives | [docs/site/architecture/](docs/site/architecture/) |
| AI assistant rules | [CLAUDE.md](CLAUDE.md) |
| Third-party licenses | [LICENSES.md](LICENSES.md) |

## Related

- **Comprobify API** — `../comprobify/` — the backend this frontend calls

## License

Proprietary and confidential — Copyright (c) 2026 Comprobify. All rights reserved. See [LICENSES.md](LICENSES.md) for third-party notices.
