# Pricing Page

**Route:** `/pricing` (marketing domain — `comprobify.com` / `staging.comprobify.com`)
**Auth:** Public — no session required.
**Layout:** `(marketing)/layout.tsx` — same public header/footer as the landing page.

---

## Content

`pricing/page.tsx` is a Server Component that fetches the live tier catalog from `listTiers()` (`src/lib/public-api.ts` → public, unauthenticated `GET /v1/tiers`) and passes it to `pricing-plans.tsx` (Client Component), which renders:

- A **Monthly / Yearly** toggle (local state). Yearly shows the discounted `priceYearlyUsd` (= `priceMonthlyUsd × 10`, i.e. 2 months free) plus an "equivalent to $X/mo" note.
- Four cards in display order **FREE → STARTER → GROWTH → BUSINESS** (`GROWTH` is the highlighted/"Most popular" card). Each shows: tier name, price for the selected interval, a one-sentence marketing blurb (i18n, not part of the API payload), and feature bullets built directly from the API response — document quota, branch/issue-point limits (`null` → "unlimited"), allowed document types (mapped through `settings.setup`'s `docType01`/`docType04`/etc. labels), and webhook endpoint limit. The **FREE** card displays `$0` with no period suffix (not `$0/mes`) since free doesn't vary by interval; paid tier cards show the price + `/mes` or `/año` depending on the selected toggle.
- The **FREE** tier is named **"Gratis"** (ES) / **"Free"** (EN) — not "Sandbox", which could mislead users into thinking it's a development-only environment. The tier's actual sandbox behavior is described in the card's marketing blurb, not the name.
- CTA per tier: **FREE** → `/register` (no query params). **STARTER/GROWTH/BUSINESS** → `/register?tier=<NAME>&interval=<MONTHLY|YEARLY>` — this is how a chosen plan survives into registration (see "Subscription & billing" in `CLAUDE.md` for the full thread through onboarding to `/settings/billing`). The register page shows "Volver a precios" (back to `/pricing`) instead of "Volver al inicio" (back to `/`) when a `?tier=` param is present.

Because the numbers come from the API at request time, this page can never drift from `comprobify`'s `subscription-tiers.js` the way the old hardcoded "Sandbox/Starter/Pro, Coming soon" placeholders did.

**Upcoming price changes.** `GET /v1/tiers` also returns `upcomingPrice{Monthly,Yearly}Usd`/`{monthly,yearly}PriceEffectiveAt` — a published-but-not-yet-effective price change still inside its 30-day notice window (ADR-023 on the API side). When present for the currently selected interval, the card shows an inline amber note ("price increases to $X on \<date\>") below the marketing blurb. This is the same information existing tenants get via the `PRICE_CHANGE_ANNOUNCED` notification, surfaced here for prospective tenants too.

---

## SEO
`generateMetadata` reads `pricing.seo.title`/`pricing.seo.description` and sets `alternates.canonical` (`/${locale}/pricing`) + `alternates.languages` (es/en hreflang, via `localeAlternates('/pricing')` in `src/lib/seo.ts`) and a matching `openGraph` block. Only indexed at all when `SEO_INDEXABLE` is true (production) — see "Marketing SEO" in `CLAUDE.md`.

---

## i18n namespaces
- `pricing` — title/subtitle, `seo` (title/description), `interval.*`, `free`/`perMonth`/`perYear`/`yearlyEquivalent`/`upcomingPriceNote`, `tiers.<NAME>.{name,description,cta}` (marketing copy only — numbers are not duplicated here), `features.*` (quota/branches/issuePoints/webhooks/docTypes label templates)
- `marketing` — shared nav and footer labels
- `settings.setup` — reused for `docType01`/`docType04`/etc. labels in the feature list

---

## Files
| File | Role |
|------|------|
| `src/app/[locale]/(marketing)/pricing/page.tsx` | Server Component — calls `listTiers()`, renders `<PricingPlans>`; `generateMetadata` |
| `src/components/pricing-plans.tsx` | Client Component — monthly/yearly toggle, tier cards, CTA links |
| `src/lib/public-api.ts` | `ApiTierInfo` interface + `listTiers()` |
| `src/app/[locale]/(marketing)/layout.tsx` | Marketing layout (header + footer); sets `metadataBase` |
| `src/lib/seo.ts` | `MARKETING_BASE_URL`/`SEO_INDEXABLE`/`localeAlternates()` |
| `messages/es.json` → `pricing`, `marketing` | Spanish copy |
| `messages/en.json` → `pricing`, `marketing` | English copy |
