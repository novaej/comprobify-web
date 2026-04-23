# ADR-004: Tailwind CSS v4 + shadcn/ui

**Status:** Accepted  
**Date:** 2026-04-22

## Context

We need a styling solution and component library for the frontend. Requirements:
- Fast to build with — MVP should ship quickly
- Looks professional out of the box
- TypeScript-first
- Compatible with Next.js 16 App Router

## Decision

**Tailwind CSS v4** for utility classes + **shadcn/ui** for pre-built components.

**Why Tailwind:**
- No context switching between CSS files and components
- Tailwind v4 uses a single CSS import (`@import "tailwindcss"`) — simpler config than v3
- Works identically in Server and Client Components

**Why shadcn/ui over alternatives (Chakra, MUI, Ant Design):**
- Components are copied into `src/components/ui/` — no runtime dependency, no version conflicts
- Unstyled base, Tailwind on top — easy to customize
- Uses Radix UI primitives (accessibility built in)
- Designed for Next.js App Router (no client-only Provider wrapping the whole app)

## How to add a new shadcn component

```bash
npx shadcn@latest add <component-name>
```

This copies the component files into `src/components/ui/`. Do not edit these files directly — re-run the command to update them. Build customizations in wrapper components.

## Consequences

- `src/components/ui/` is auto-generated — never edit manually
- `globals.css` is imported once in `src/app/layout.tsx`
- shadcn generates both light and dark mode CSS variables — dark mode is available without additional setup
- Custom components go in `src/components/` (one level up from `ui/`)
