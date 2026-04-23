# Changelog

All notable changes to `comprobify-web` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [Unreleased]

### Added
- Initial Next.js 16 (App Router) scaffold with TypeScript and Tailwind CSS v4
- next-intl localization with Spanish default (`es`) and English (`en`) locales
- `src/lib/api.ts` — typed Comprobify API client (server-only, BFF pattern)
- `src/lib/errors.ts` — `ApiError` class wrapping RFC 7807 Problem Details
- `src/providers/query-provider.tsx` — TanStack Query client provider
- `src/components/nav.tsx` — sidebar navigation (Dashboard, Nueva factura, Configuración)
- `src/components/status-badge.tsx` — color-coded document status badge
- `src/components/sandbox-banner.tsx` — yellow sandbox mode banner
- `src/middleware.ts` — next-intl locale routing middleware
- `GET /api/documents/:key/status` Next.js proxy route for client-side polling
- Stub pages for Dashboard, Create Invoice, Invoice Detail, and Settings
- shadcn/ui components: badge, button, card, table, input, label, select, textarea, separator, skeleton, dialog, sonner
- Full ADR documentation (ADR-001 through ADR-006)
- Coding guides, documentation checklist, and code-flow walkthrough
- `.example.env` with all required environment variables
