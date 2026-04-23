# ADR-003: MVP Authentication — Single Env Var API Key

**Status:** Accepted  
**Date:** 2026-04-22

## Context

The Comprobify frontend needs authentication. Options considered:

1. **Single env var API key** — no user login, the API key is hardcoded in the server environment
2. **NextAuth.js credentials provider** — email/password login, API key stored in encrypted JWT session
3. **OAuth2 provider** — Google/GitHub login

## Decision

**Start with option 1 (single env var)** for MVP.

The first user is the developer (the issuer). There is one Comprobify API key, set in `COMPROBIFY_API_KEY`. Every page load and server action uses that key. No login screen, no session management, no user database.

**Why:**
- Zero complexity — ship the features that matter (creating invoices) before adding auth complexity
- Vercel environment variables provide adequate security for a single-operator tool
- The API key pattern is already established in the Comprobify API — nothing new to build there
- NextAuth can be added later without touching the Comprobify API (ADR-002 pattern is preserved)

## Phase 2 upgrade path

When multi-user is needed:
1. Add NextAuth.js credentials provider
2. Create a `users` table in a separate database (see FRONTEND_MVP.md Phase 2 schema)
3. Store `comprobify_api_key` in the encrypted NextAuth JWT `token` (not `session`)
4. Replace `process.env.COMPROBIFY_API_KEY` with `getToken({ req }).apiKey` in server-side code
5. Add a login page at `[locale]/login/page.tsx`

The BFF pattern (ADR-002) is unchanged by this upgrade — only the source of the API key changes.

## Consequences

- No login screen in MVP
- `COMPROBIFY_API_KEY` is a required environment variable — the app throws at startup if missing
- Any person with access to the deployment URL can use the frontend (acceptable for a single-operator MVP)
- The Settings screen has a "Reveal API key" button that returns `COMPROBIFY_API_KEY` from the server via a Server Action — same UX as GitHub's "show token once"
