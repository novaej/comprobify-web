# ADR-005: TanStack Query for Status Polling Only

**Status:** Accepted  
**Date:** 2026-04-22

## Context

Document status polling is needed for the `RECEIVED → AUTHORIZED` transition. When the user sends a document to the SRI, the API returns `RECEIVED` status. The SRI processes the document asynchronously (typically 5–30 seconds). The frontend needs to poll until the status changes.

Options considered:
1. **Server-only polling** — page refreshes every N seconds (not real-time, poor UX)
2. **TanStack Query + API route proxy** — client-side polling via a Next.js proxy route
3. **WebSockets / SSE** — server pushes status updates (over-engineered for MVP)

## Decision

Use **TanStack Query with a Next.js proxy route** for polling. All other data fetching uses Server Components (no TanStack Query for initial page loads).

**Polling flow:**
```
InvoiceDetailPage (Server Component)
  → detects status === 'RECEIVED'
  → renders a Client Component with TanStack Query
  → useQuery polls GET /api/documents/:key/status (Next.js proxy route) every 5s
  → proxy route calls GET /api/documents/:key on Comprobify API (server-to-server)
  → when status changes away from RECEIVED, polling stops
  → component re-renders with new status
```

**Why TanStack Query instead of raw `setInterval` + `fetch`:**
- Deduplication, retry on failure, background refetch are built in
- `refetchInterval` stops automatically when `enabled: false`
- Cleaner component code — no `useEffect` + `clearInterval` cleanup

**Why NOT use TanStack Query for initial page data:**
- Server Components are faster for initial render (no client JS needed, no waterfall)
- The dashboard invoice list doesn't need real-time updates

**Polling strategy:**
- Interval: 5 seconds
- Timeout: 2 minutes (24 polls), then show a manual "Check again" button
- Condition: only poll when `status === 'RECEIVED'`

## Consequences

- `QueryProvider` wraps the locale layout (needed for TanStack Query hooks in any client component)
- `GET /api/documents/:key/status` is a Next.js Route Handler that proxies to the Comprobify API
- The API key never reaches the browser (BFF pattern preserved — see ADR-002)
- TanStack Query devtools are included in development via `ReactQueryDevtools`
- `refetchOnWindowFocus: false` is set globally to prevent unexpected polling on tab switches
