# Landing Page

**Route:** `/` (marketing domain — `comprobify.com` / `staging.comprobify.com`)  
**Auth:** Public — no session required. Authenticated users are redirected to `/dashboard`.  
**Layout:** `(marketing)/layout.tsx` — public header with logo, nav, and CTA buttons; footer with links.

---

## Sections

### Hero
Full-viewport-height centered section with headline, subtitle, and two CTAs: "Crear cuenta gratis" (→ `/register`) and "Iniciar sesión" (→ `/login`).

### Feature cards
Two cards side by side (`md:grid-cols-2`):
- **API para desarrolladores** — description of the REST API; CTA links to external API docs (`https://novaej.github.io/comprobify/`).
- **Aplicación web** — description of the web UI; CTA links to `/register`.

---

## i18n namespaces
- `landing` — hero and feature card copy
- `marketing` — shared nav and footer labels (also used by the Pricing page layout)

---

## Files
| File | Role |
|------|------|
| `src/app/[locale]/(marketing)/page.tsx` | Server Component — page content |
| `src/app/[locale]/(marketing)/layout.tsx` | Marketing layout (header + footer) |
| `messages/es.json` → `landing`, `marketing` | Spanish copy |
| `messages/en.json` → `landing`, `marketing` | English copy |
