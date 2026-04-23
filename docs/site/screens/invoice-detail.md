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
| SIGNED | "Enviar al SRI" button |
| RECEIVED | "Verificar autorización" button + polling spinner |
| AUTHORIZED | "Descargar PDF", "Descargar XML", "Reenviar correo" |
| RETURNED | "Ver errores SRI" (collapsible), "Reconstruir" |
| NOT_AUTHORIZED | Same as RETURNED |

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

The SRI response is stored in `sri_responses` table on the API side. Currently not returned by the document presenter — needs a new field or endpoint. For MVP, show a generic message: "El SRI devolvió errores. Reconstruye el comprobante para corregirlos."

---

## Rebuild flow

```
Invoice Detail (RETURNED or NOT_AUTHORIZED)
  → user clicks "Reconstruir"
  → navigate to /invoices/new?rebuild=:accessKey
  → form pre-filled with original data (from document.requestPayload or re-parsed)
  → submit → POST /api/documents/:key/rebuild
  → redirect to Invoice Detail (status: SIGNED)
```
