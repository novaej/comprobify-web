# ADR-001: Next.js 16 App Router

**Status:** Accepted  
**Date:** 2026-04-22

## Context

We need a React framework for the Comprobify frontend. Requirements:
- Server-side rendering for the initial document list (SEO is not a concern but performance is)
- Server-side execution for Comprobify API calls (API key must not reach the browser)
- Good TypeScript support
- Free or cheap deployment
- Single developer, fast iteration

## Decision

Use **Next.js 16 with App Router**.

**Why App Router over Pages Router:**
- Server Components let us fetch data on the server and render HTML without an extra client-side fetch
- Server Actions let us handle form mutations without writing dedicated API routes for each action
- The BFF pattern (API key in server environment, calls made server-to-server) is the natural way to use App Router
- React 18 Suspense and streaming are available for progressive loading

**Why Next.js over alternatives (Remix, SvelteKit, Vite+React):**
- Deploys for free on Vercel with zero configuration
- next-intl has first-class App Router support
- shadcn/ui components are designed and tested with Next.js App Router
- Familiarity — faster to ship MVP

## Consequences

- All pages live under `src/app/[locale]/`
- Server Components are the default; `'use client'` is added only where necessary
- Forms use Server Actions for mutations (`'use server'` functions)
- Client-side polling uses TanStack Query + a Next.js proxy route (see ADR-005)
- Pages must call `setRequestLocale(locale)` at the top for static rendering to work
