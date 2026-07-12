# Invoice Detail Screen

**Route:** `/es/invoices/:accessKey`  
**Component:** `src/app/[locale]/invoices/[key]/page.tsx`  
**Type:** Server Component with Client Component sections for polling and actions

Despite the route name, this page is the generic detail screen for **every** document type, not just invoices — `DocumentTable` links every type's rows here, and `getDocument()`/`getDocumentEvents()` are not type-specific. A credit note (type `04`) renders on the exact same route.

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
│  [Vista previa PDF]  [⋮ Acciones]                     │
│  (preview panel appears here, below the row, once     │
│   "Vista previa PDF" is clicked)                       │
├──────────────────────────────────────────────────────┤
│  Detalle de productos                                  │
│  Descripción │ Cant │ P.unit │ Desc │ Subtotal         │
│  ...                                                   │
├──────────────────────────────────────────────────────┤
│  Historial                                             │
│  Evento                  │Anterior│  →  │Nuevo    │Fecha│Detalle│
│  Comprobante creado...   │   —    │     │Firmado  │ ... │  —    │
│  Enviado al SRI          │Firmado │  →  │Recibido │ ... │  —    │
│  Autorizado por el SRI   │Recibido│  →  │Autorizado│... │240420...│
└──────────────────────────────────────────────────────┘
```

---

## Access

Requires: `documents.read` permission (`requirePermission('documents.read')`). All five roles have `documents.read`, so any authenticated user with an issuer can view the detail page. Mutation controls are gated separately by `documents.manage` / `documents.create` (see below).

---

## Contextual actions by status

Rendered by `<InvoiceActions accessKey={...} status={...} documentType={...} from={backTargetKey} canManage={...} canCreate={...} />` (`src/components/invoice-actions.tsx`). The page computes `canManage = ctx.permissions.has('documents.manage')` and `canCreate = ctx.permissions.has('documents.create')` and passes them as props — the component never reads permissions directly (it's a Client Component). Roles without `documents.manage` (Viewer, Developer) see only the read-only actions; roles without `documents.create` do not see "Crear nota de crédito".

| Status | Actions shown | Permission required |
|---|---|---|
| SIGNED | "Enviar" button | `documents.manage` |
| RECEIVED | Polling spinner (automatic, no user action) | — |
| AUTHORIZED | "Vista previa PDF" (primary, toggles inline preview) | — |
| AUTHORIZED | "⋮ Acciones" dropdown: download XML | — |
| AUTHORIZED | "⋮ Acciones" dropdown: resend email | `documents.manage` |
| AUTHORIZED | "⋮ Acciones" dropdown: "Crear nota de crédito" (type `01` only) | `documents.create` |
| RETURNED | "Corregir" button | `documents.manage` |
| NOT_AUTHORIZED | Same as RETURNED | `documents.manage` |

The "Corregir" link's target depends on `documentType` via `REBUILD_HREFS` — `/invoices/new?rebuild=...` for type `01`, `/credit-notes/new?rebuild=...` for type `04` — since both document types reuse this same detail page and action component. "Crear nota de crédito" links to `/credit-notes/new?fromInvoice=:accessKey&from=...`, pre-filling the credit note form from this invoice (see `credit-notes.md`).

`from` is this page's own validated `?from=` value, forwarded into both the "Corregir" link and the "Crear nota de crédito" link so their target form's back-link chain stays correct.

---

## Status polling (RECEIVED)

When `status === 'RECEIVED'`:
1. Render `<StatusPoller accessKey={key} />` (Client Component)
2. TanStack Query polls `GET /api/documents/:key/status` every 5 seconds
3. Show a spinner with "Esperando respuesta del SRI..."
4. After 2 minutes: stop polling, show "Verificar manualmente" button
5. When status changes: invalidate query, re-render with new status

---

## Events timeline (Historial)

`GET /api/documents/:key/events` returns raw `{ eventType, fromStatus, toStatus, detail }` rows. Rendering the raw `eventType` (old behavior) produced unhelpful rows like "Estado actualizado" for every `STATUS_CHANGED` event, with no indication of what actually changed.

`describeDocumentEvent()` (`src/lib/event-description.ts`) maps each known `eventType` to a specific title + optional detail string, verified against every event-creating call site in the API (`document-creation`, `document-rebuild`, `document-transmission`, `document-email`, `mailgun-webhook` services):

| eventType | Title shown | Detail shown |
|---|---|---|
| `CREATED` | "Comprobante creado y firmado" | — |
| `REBUILT` | "Comprobante corregido" | — |
| `SENT` | "Enviado al SRI" | "En procesamiento por el SRI" if SRI returned status `70` |
| `STATUS_CHANGED` → `AUTHORIZED` | "Autorizado por el SRI" | Authorization number (copyable) |
| `STATUS_CHANGED` → `NOT_AUTHORIZED` | "No autorizado por el SRI" | Raw `sriStatus` code (e.g. `NO_AUTORIZADO`) |
| `ERROR` | "Error al enviar al SRI" / "Error al verificar autorización" (by `detail.operation`) | The error message |
| `EMAIL_SENT` / `EMAIL_FAILED` / `EMAIL_DELIVERED` / `EMAIL_TEMP_FAILED` / `EMAIL_COMPLAINED` | One title per outcome | Recipient email / error message |

The table has dedicated "Estado anterior"/"Estado nuevo" columns rendering each side of a status transition as a colored `<StatusBadge>`, with an arrow icon between them — not just for `STATUS_CHANGED`, but for any event carrying a transition (`CREATED`, `REBUILT`, `SENT`). Events with no transition (the email events, `ERROR`) show "—" in both columns.

**Known gap:** SRI's actual rejection *reason text* (e.g. "RUC no existe") is sent by SRI and stored server-side in a `sri_responses` table, but no API endpoint exposes it — `NOT_AUTHORIZED`/`RETURNED` rows can only show the bare status code, not the prose reason. Surfacing it would require a new backend endpoint (out of scope for the frontend alone).

---

## Rebuild ("Corregir") flow

```
Invoice Detail (RETURNED or NOT_AUTHORIZED, ?from=<backTargetKey>)
  → user clicks "Corregir"
  → navigate to /invoices/new?rebuild=:accessKey&from=<backTargetKey>
    (or /credit-notes/new?rebuild=... for a type-04 document)
  → form pre-filled from document.requestPayload
  → user picks "Corregir" (sign-only) or "Corregir y Enviar" (sign + best-effort send)
  → submit → POST /api/documents/:key/rebuild (same accessKey/sequential, status → SIGNED)
  → redirect to Invoice Detail at the SAME accessKey, with ?from= preserved
```

Both the create form and the rebuild form share one confirmation dialog and one pair of buttons (sign-only / sign-and-send) — see `docs/site/screens/create-invoice.md` → "Submit buttons" (and `credit-notes.md` for the credit-note equivalent). `?from=` is threaded through this entire loop so the back links keep pointing at wherever the user actually started instead of always falling back to the dashboard.

---

## PDF preview (AUTHORIZED)

"Vista previa PDF" lives inside `<InvoiceActions>` itself, not a separate component below it — there used to be a standalone "Descargar PDF" button *and* a separate preview toggle, which read as two redundant "see the PDF" entry points; they were merged into one.

```
AUTHORIZED, collapsed
  → click "Vista previa PDF" (toggles `previewOpen` state in InvoiceActions)
  → InvoicePdfPreview mounts (via next/dynamic, ssr: false — see invoice-pdf-preview-lazy.tsx)
  → <Document file="/api/documents/:key/ride"> (react-pdf) fetches and renders the existing download route
  → ResizeObserver keeps the rendered page width responsive
  → Previous/Next controls appear only if the PDF has more than one page
  → a small "Descargar" button inside the panel is the only PDF download entry point
```

No new API endpoint — it points at the same `/api/documents/:key/ride` route. The worker script (`pdfjs-dist`) is resolved via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` so the bundler serves it with correct headers, instead of a manually-copied `public/` file (which failed at runtime — see CLAUDE.md Common Mistake #27).
