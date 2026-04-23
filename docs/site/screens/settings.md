# Settings Screen

**Route:** `/es/settings`  
**Component:** `src/app/[locale]/settings/page.tsx`  
**Type:** Server Component

---

## Purpose

Displays issuer information, the sandbox/production badge, certificate expiry, and provides a way to reveal the API key for direct API use.

---

## Sections

### 1. Environment badge

Prominently shows whether the current API key points to a sandbox or production issuer:

```
🟡 Sandbox (SRI pruebas)
or
🟢 Producción (SRI real)
```

Driven by `COMPROBIFY_SANDBOX` env var in MVP. Phase 2: fetch from `GET /api/issuer/me`.

### 2. Issuer information (read-only in MVP)

| Field | Source |
|---|---|
| Nombre / Razón social | Needs API endpoint (`GET /api/issuer/me`) |
| RUC | Needs API endpoint |
| Vencimiento del certificado | Needs API endpoint |
| Huella del certificado (SHA-1) | Needs API endpoint |

MVP fallback: show fields as "—" or load from env vars if provided.

### 3. API Key

Shows a masked key with a "Mostrar clave" button. On click, a Server Action returns `COMPROBIFY_API_KEY` from `process.env`. The key is shown in a read-only input with a copy button.

This is the only case where the API key is deliberately returned to the browser — the user explicitly requested it (same pattern as GitHub's "Show token once").

```tsx
// Server Action
'use server'
async function revealApiKey() {
  return process.env.COMPROBIFY_API_KEY;
}
```

---

## Missing API endpoint

All issuer data (name, RUC, cert expiry, fingerprint) requires a new endpoint on the Comprobify API:

`GET /api/issuer/me` — returns the issuer associated with the current API key.

Until that endpoint exists, issuer fields show placeholder values. See NEXT_STEPS.md item 10.
