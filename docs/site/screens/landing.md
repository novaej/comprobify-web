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

## SEO
`generateMetadata` reads `landing.seo.title`/`landing.seo.description` and sets `alternates.canonical` (`/${locale}`) + `alternates.languages` (es/en hreflang, via `localeAlternates()` in `src/lib/seo.ts`) and a matching `openGraph` block. `metadataBase` comes from the marketing layout's own `metadata` export. Only indexed at all when `SEO_INDEXABLE` is true (production) — see "Marketing SEO" in `CLAUDE.md`.

---

## i18n namespaces
- `landing` — hero, feature card, and `seo` (title/description) copy
- `marketing` — shared nav and footer labels (also used by the Pricing page layout)

---

## Files
| File | Role |
|------|------|
| `src/app/[locale]/(marketing)/page.tsx` | Server Component — page content + `generateMetadata` |
| `src/app/[locale]/(marketing)/layout.tsx` | Marketing layout (header + footer); sets `metadataBase` |
| `src/lib/seo.ts` | `MARKETING_BASE_URL`/`SEO_INDEXABLE`/`localeAlternates()` |
| `messages/es.json` → `landing`, `marketing` | Spanish copy |
| `messages/en.json` → `landing`, `marketing` | English copy |
