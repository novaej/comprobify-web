# Support Screen

**Route:** `/support`
**Component:** `src/app/[locale]/support/page.tsx`
**Type:** Server Component

---

## Purpose

Static contact page showing a support email and a WhatsApp number (`SUPPORT_EMAIL` / `SUPPORT_PHONE` env vars, read server-side only). No form, no Server Action — just a `mailto:` link and an `https://wa.me/<digits>` link (opened in a new tab); `SUPPORT_PHONE`'s non-digit characters are stripped when building the `wa.me` URL.

**Access:** Public. Listed in `PUBLIC_ROUTES` in `src/proxy.ts` so it works both for signed-out visitors (locked-out users, prospects) and any authenticated user, regardless of role, tenant, or `active` status.

---

## Dual chrome

The page renders one of two layouts depending on whether the locale layout (`src/app/[locale]/layout.tsx`) will actually wrap it in `Nav`/`TopBar`:

- **In-app chrome** — when the signed-in user is `active` and has a `tenantId` (the same condition `getLayoutProps` in the locale layout uses to decide whether to render `Nav`), the page renders only a `PageHeader` + contact cards; the sidebar/top bar are already provided by the layout.
- **Standalone chrome** — for signed-out visitors, disabled users, and tenant-less accounts (e.g. super admins) — cases where the locale layout falls back to `<>{children}</>` with no wrapper — the page renders its own header (logo, back-to-home link, locale switcher, theme toggle), mirroring `login`/`register`/`verify-email`.

This means the page re-derives `active`/`tenantId` via a small dedicated `db.user.findUnique` query rather than trusting `auth()` session presence alone — a truthy session does not guarantee the layout rendered `Nav` (see Common Mistake set for disabled-user/no-tenant handling elsewhere in this codebase).

---

## Entry points

- Sidebar nav item (`src/components/nav.tsx`, `LifeBuoy` icon) — visible to every authenticated role, no permission gate, `requiresIssuer: false`.
- Marketing footer (`src/app/[locale]/(marketing)/layout.tsx`) — plain `<a>` (crosses the marketing ↔ app domain boundary, see Common Mistake #35).
- Login and register pages — a small "need help?" link (`Link` from `@/i18n/navigation`, same-domain) below the existing footer line.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/support/page.tsx` | Server Component — dual chrome, reads `SUPPORT_EMAIL`/`SUPPORT_PHONE` |
| `src/components/nav.tsx` | Sidebar entry (`labelKey: 'support'`) |
| `src/proxy.ts` | `PUBLIC_ROUTES` includes `support` |
| `.example.env` | `SUPPORT_EMAIL`, `SUPPORT_PHONE` |
