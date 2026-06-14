# Pricing Page

**Route:** `/pricing` (marketing domain — `comprobify.com` / `staging.comprobify.com`)  
**Auth:** Public — no session required.  
**Layout:** `(marketing)/layout.tsx` — same public header/footer as the landing page.

---

## Content

Three plan cards in a responsive grid (`md:grid-cols-3`):

| Key | Name | Price | Highlighted |
|-----|------|-------|-------------|
| `sandbox` | Sandbox / Sandbox | Free / Gratis | No |
| `starter` | Starter / Básico | Coming soon / Próximamente | Yes (primary border + ring) |
| `pro` | Professional / Profesional | Coming soon / Próximamente | No |

Each card shows: plan name, price, description, feature list (checkmark icons), and a CTA button (→ `/register`).

The "Most popular" badge appears above the highlighted plan name.

---

## Plan features (from i18n)

Features are stored as JSON arrays under `pricing.plans.<key>.features` and rendered with a check icon per item. The component reads them via `t.raw(...)` to get the raw array.

---

## i18n namespaces
- `pricing` — all plan copy, title, subtitle, badge
- `marketing` — shared nav and footer labels

---

## Files
| File | Role |
|------|------|
| `src/app/[locale]/(marketing)/pricing/page.tsx` | Server Component — plan grid |
| `src/app/[locale]/(marketing)/layout.tsx` | Marketing layout (header + footer) |
| `messages/es.json` → `pricing`, `marketing` | Spanish copy |
| `messages/en.json` → `pricing`, `marketing` | English copy |
