# ADR-002: Backend-for-Frontend (BFF) Pattern

**Status:** Accepted  
**Date:** 2026-04-22

## Context

The Comprobify API is authenticated via a Bearer token (API key). This key must be kept secret — it controls access to all invoices and can create new ones. We need a way to build a browser-based UI without exposing the API key to the browser.

## Decision

Use the **BFF pattern**: Next.js acts as a server-side intermediary between the browser and the Comprobify API.

```
Browser ─────────────────────► Next.js server
        (no API key, no direct   │  reads COMPROBIFY_API_KEY
         Comprobify API calls)   │  from process.env
                                 ▼
                          Comprobify API
               (Authorization: Bearer <key>)
               (server-to-server, never reaches browser)
```

The API key lives in `process.env.COMPROBIFY_API_KEY` on the Next.js server. It is:
- Never prefixed with `NEXT_PUBLIC_`
- Never included in Server Action return values (except behind an explicit "reveal" button)
- Never passed as a prop from server to client components
- Only readable via `getToken()` or `process.env` in server-side code

## How each request type works

| Request type | Where API call happens | API key visible to browser? |
|---|---|---|
| Page load (Server Component) | Next.js server | No |
| Form submit (Server Action) | Next.js server | No |
| Status polling (TanStack Query → proxy route) | Next.js server | No |
| File download (PDF/XML) | Server Action → stream | No |

## Consequences

- `src/lib/api.ts` is the single place all Comprobify API calls are made — server-only
- Client Components never call the Comprobify API directly
- The one exception is the proxy route (`GET /api/documents/:key/status`) used by TanStack Query for polling — the route handler is still server-side, the browser only calls the Next.js domain
- MVP has no session/auth — the API key is a single environment variable
