# comprobify-web

Next.js 16 frontend for the [Comprobify](../comprobify/) electronic invoice API. Lets non-technical users create, send, and authorize Ecuadorian electronic invoices (facturas electrónicas SRI) from a browser.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query (polling only) |
| Localization | next-intl (Spanish default) |

## Architecture

```
Browser ──────────────────► Next.js (this repo)
        (no API key visible)       │  reads API key from env
                                   ▼
                            Comprobify API
                     (Authorization: Bearer <api-key>)
```

All Comprobify API calls happen server-side (BFF pattern). The API key is never sent to the browser. See [docs/adr/002-bff-pattern.md](docs/adr/002-bff-pattern.md).

## Screens

| Route | Screen |
|---|---|
| `/es/dashboard` | Invoice list + summary |
| `/es/invoices/new` | Create invoice form |
| `/es/invoices/:key` | Invoice detail + actions |
| `/es/settings` | Issuer info + API key reveal |

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
| Screen specs | [docs/site/screens/](docs/site/screens/) |
| Architecture deep-dives | [docs/site/architecture/](docs/site/architecture/) |
| AI assistant rules | [CLAUDE.md](CLAUDE.md) |

## Related

- **Comprobify API** — `../comprobify/` — the backend this frontend calls
