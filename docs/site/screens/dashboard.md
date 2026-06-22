# Dashboard Screen

**Route:** `/es/dashboard`  
**Component:** `src/app/[locale]/dashboard/page.tsx`  
**Type:** Server Component

---

## Purpose

The first screen after login. Shows KPI summary cards for the current month plus a preview of the most recent documents. Entry point for creating new invoices.

---

## API calls

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/documents?limit=10` | 10 most recent documents (table preview) |
| GET | `/v1/documents/stats` | KPI cards: issued-this-month by type, needs-attention count |

Both calls run in parallel via `Promise.allSettled` — a failure in one does not block the other from rendering.

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  [SandboxBanner — yellow, shown when tenant.environment === 'sandbox'] │
├─────────────────────────────────────────────────────────┤
│  Panel                          [Nueva factura ➕]        │
├──────────────────┬──────────────────┬────────────────────┤
│ Emitidos este mes │ Ingresos netos   │ Requieren atención │
│ 12                │ autorizados      │ 2                  │
│ Factura: 8        │ $1,800.00        │ (red if > 0)        │
│ Nota de crédito: 4│                  │                     │
├──────────────────┴──────────────────┴────────────────────┤
│  Comprobantes recientes              [Ver todos →]        │
├─────────────────────────────────────────────────────────┤
│  Número │ Cliente │ Fecha │ Total │ Estado │              │
│  ─────────────────────────────────────────────           │
│  001-001-000000010 │ ... │  $115.00 │ [Autorizado] │ ... │
│  001-001-000000009 │ ... │   $23.00 │ [Firmado]    │ ... │
│  ... (max 10 rows)                                        │
└─────────────────────────────────────────────────────────┘
```

KPI cards stack into a single column below `sm` breakpoint (rule 11 — mobile responsiveness).

---

## KPI cards

Rendered by `src/components/dashboard-summary-cards.tsx`, fed by `getDocumentStats()` (`GET /v1/documents/stats`):

| Card | Source | Notes |
|---|---|---|
| Emitidos este mes | `stats.thisMonth.byType[].issued`, summed | Per-type breakdown shown as small badges below the total, using the same `documents.types.{code}.name` i18n labels as the Comprobantes hub |
| Ingresos netos autorizados (mes) | `FAC + LIQ + DEB − CRE` of each type's `authorizedTotal` | `RET`/`REM` excluded — no monetary meaning for this widget. Formatted via `Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })` |
| Requieren atención | `stats.needsAttention` | All-time count of `RETURNED` + `NOT_AUTHORIZED` documents (not scoped to this month); rendered in red when `> 0` |

If `getDocumentStats()` fails, all three cards show an inline error message instead of crashing the page; the document table is fetched independently and still renders.

---

## Recent documents table

Capped to 10 rows (`listDocuments(apiCtx, { limit: 10 })`) — this is a preview, not a paginated list. A "Ver todos" link next to the "Comprobantes recientes" heading routes to `/documents` (the full Comprobantes hub), which is where users browse the complete, paginated list per document type via `src/app/[locale]/documents/[type]/page.tsx` and `src/components/document-pagination.tsx`.

---

## Status badge colors

| Status | Color |
|---|---|
| SIGNED | Gray |
| RECEIVED | Blue |
| AUTHORIZED | Green |
| RETURNED | Orange |
| NOT_AUTHORIZED | Red |

---

## State: empty list

Show a centered empty state with a "Crea tu primer comprobante" CTA button.
