# Invoice Detail Screen

**Route:** `/es/invoices/:accessKey`  
**Component:** `src/app/[locale]/invoices/[key]/page.tsx`  
**Type:** Server Component with Client Component sections for polling and actions

---

## Purpose

Shows the full state of a document and provides contextual actions based on its current status.

---

## API calls

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/documents/:key` | Document data (initial load) |
| POST | `/api/documents/:key/send` | Send to SRI (Server Action) |
| GET | `/api/documents/:key/authorize` | Check SRI authorization (Server Action / polling) |
| POST | `/api/documents/:key/rebuild` | Rebuild document (Server Action) |
| GET | `/api/documents/:key/ride` | Download PDF (streamed) |
| GET | `/api/documents/:key/xml` | Download XML (streamed) |
| POST | `/api/documents/:key/email-retry` | Resend authorized invoice email |
| GET | `/api/documents/:key/events` | Event timeline |

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│  ← Volver al panel                                    │
│                                                        │
│  001-001-000000003                    [Autorizado ✓]  │
│  Clave: 2404202501...                [copy button]    │
│                                                        │
│  Fecha: 24/04/2025    Comprador: Empresa S.A.         │
│  Total: $115.00       RUC: 0999999999001              │
│                                                        │
│  [Contextual actions — see table below]               │
├──────────────────────────────────────────────────────┤
│  Detalle de productos                                  │
│  Descripción │ Cant │ P.unit │ Desc │ Subtotal         │
│  ...                                                   │
├──────────────────────────────────────────────────────┤
│  Historial de eventos                                  │
│  CREATED  │ 24/04/2025 10:00 │ -                      │
│  SENT     │ 24/04/2025 10:01 │ -                      │
│  STATUS_CHANGED │ AUTHORIZED │ ...                     │
└──────────────────────────────────────────────────────┘
```

---

## Contextual actions by status

| Status | Actions shown |
|---|---|
| SIGNED | "Enviar" button |
| RECEIVED | "Verificar autorización" button + polling spinner |
| AUTHORIZED | "Descargar PDF", "Descargar XML", "Reenviar correo" |
| RETURNED | "Corregir" button (`src/components/invoice-actions.tsx`) |
| NOT_AUTHORIZED | Same as RETURNED |

Rendered by `<InvoiceActions accessKey={...} status={...} from={backTargetKey} />` — `from` is this page's own validated `?from=` value, forwarded into the "Corregir" link (`/invoices/new?rebuild=:accessKey&from=...`) so the correction form's back-link chain stays correct (see "Rebuild flow" below).

---

## Status polling (RECEIVED)

When `status === 'RECEIVED'`:
1. Render `<StatusPoller accessKey={key} />` (Client Component)
2. TanStack Query polls `GET /api/documents/:key/status` every 5 seconds
3. Show a spinner with "Esperando respuesta del SRI..."
4. After 2 minutes: stop polling, show "Verificar manualmente" button
5. When status changes: invalidate query, re-render with new status

---

## SRI errors display (RETURNED / NOT_AUTHORIZED)

**Known gap** — there's no dedicated "why was this returned" panel. The closest thing today is the Events timeline at the bottom of the page, which already surfaces `detail.message`/`detail.error`/`detail.sriStatus` for the `RETURNED`/`NOT_AUTHORIZED` transition event (via `formatEventDetail()` in `src/app/[locale]/invoices/[key]/page.tsx`). A dedicated, more prominent error display would be a follow-up, not yet built.

---

## Rebuild ("Corregir") flow

```
Invoice Detail (RETURNED or NOT_AUTHORIZED, ?from=<backTargetKey>)
  → user clicks "Corregir"
  → navigate to /invoices/new?rebuild=:accessKey&from=<backTargetKey>
  → form pre-filled from document.requestPayload (src/components/invoice-form.tsx → requestPayloadToFormValues)
  → user picks "Corregir" (sign-only) or "Corregir y Enviar" (sign + best-effort send)
  → submit → POST /api/documents/:key/rebuild (same accessKey/sequential, status → SIGNED)
  → redirect to Invoice Detail at the SAME accessKey, with ?from= preserved
```

Both the create form and the rebuild form share one confirmation dialog and one pair of buttons (sign-only / sign-and-send) — see `docs/site/screens/create-invoice.md` → "Submit buttons". `?from=` is threaded through this entire loop (Invoice Detail → rebuild form → back to Invoice Detail) so the top/bottom back links keep pointing at wherever the user actually started (e.g. `/documents/01`) instead of always falling back to the dashboard.
