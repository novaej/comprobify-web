# Authentication Architecture

How authentication works in `comprobify-web`, now (MVP) and in Phase 2.

---

## MVP: Single env var API key

No user login. The Comprobify API key lives in `COMPROBIFY_API_KEY` on the Next.js server.

```
COMPROBIFY_API_KEY=abc123  ← in .env.local / Vercel environment
         │
         └─► process.env.COMPROBIFY_API_KEY
                   │ (server-only, never NEXT_PUBLIC_)
                   │
         src/lib/api.ts reads it
                   │
         All API calls: Authorization: Bearer abc123
```

**Security properties:**
- Key is never sent to the browser
- Key is never in JavaScript bundles
- `NEXT_PUBLIC_` prefix is forbidden (would expose it)

**Trade-off:** Anyone with the deployment URL can use the app. Acceptable for a single-operator tool.

---

## Settings "Reveal API key"

The Settings screen has a "Mostrar clave" button. This is the only intentional case where the API key is returned to the browser — on explicit user request:

```ts
'use server'
async function revealApiKey() {
  return process.env.COMPROBIFY_API_KEY;  // Returned only on user action
}
```

This matches GitHub's "Show token once" UX. The key should not be included in any page's initial load.

---

## Phase 2: NextAuth credentials provider

When multi-user support is needed:

```
Browser POSTs /api/auth/signin  (email + password)
  → NextAuth authorize() validates against frontend users DB
  → NextAuth encrypts { apiKey } into JWT (NEXTAUTH_SECRET)
  → Set-Cookie: next-auth.session-token=<encrypted blob>  (HttpOnly, Secure, SameSite=Lax)
  → No API key in response body
```

**Critical:** The API key goes into `token` (JWT, server-only via `getToken()`), NOT into `session` (the subset exposed to the browser via `useSession()`).

```ts
callbacks: {
  jwt({ token, user }) {
    if (user) token.apiKey = user.apiKey;  // encrypted in JWT
    return token;
  },
  session({ session }) {
    // Do NOT add token.apiKey here — would expose it to browser
    return session;
  }
}
```

Reading the key in server-side code:
```ts
import { getToken } from 'next-auth/jwt';
const token = await getToken({ req });
const apiKey = token.apiKey;  // server-only
```

Replace `process.env.COMPROBIFY_API_KEY` with this in `src/lib/api.ts` when Phase 2 ships.

---

## API key revocation handling

If the API key is revoked while a user is active, the next proxied API call returns `401`. Handle it:

```ts
// In a Server Action
if (err instanceof ApiError && err.isUnauthorized()) {
  redirect('/login');  // Phase 2
}
```

In MVP (no login page), a `401` shows a generic error message.
