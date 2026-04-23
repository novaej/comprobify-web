# Dashboard Screen

**Route:** `/es/dashboard`  
**Component:** `src/app/[locale]/dashboard/page.tsx`  
**Type:** Server Component

---

## Purpose

The first screen after "login" (or after navigating to the app). Shows a summary of invoice activity and a list of all documents. Entry point for creating new invoices.

---

## API calls

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/documents` | Paginated invoice list |
| GET | `/api/documents?status=AUTHORIZED&from=01/05/2025&to=31/05/2025` | Authorized this month (summary card) |
| GET | `/api/documents?status=SIGNED` + `?status=RECEIVED` | Pending count (summary card) |

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  [SandboxBanner — yellow, shown when COMPROBIFY_SANDBOX] │
├─────────────────────────────────────────────────────────┤
│  Panel                          [Nueva factura ➕]        │
├──────────────┬──────────────┬──────────────────────────┤
│ Total        │ Autorizados  │ Pendientes                │
│ comprobantes │ este mes     │ (SIGNED + RECEIVED)       │
├─────────────────────────────────────────────────────────┤
│  Invoice list table                                      │
│  Número │ Cliente │ Total │ Estado │ Fecha              │
│  ─────────────────────────────────────────────          │
│  001-001-000000003 │ ... │ $115.00 │ [Autorizado] │ ... │
│  001-001-000000002 │ ... │  $23.00 │ [Firmado]    │ ... │
│  ...                                                     │
│  [Pagination controls]                                   │
└─────────────────────────────────────────────────────────┘
```

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

---

## Known gaps

- `buyerName` is not yet returned by the Comprobify API presenter. Shows "-" until the API is updated. See NEXT_STEPS.md item 1.
- Summary cards require separate API calls or a future `GET /api/documents/summary` endpoint.
