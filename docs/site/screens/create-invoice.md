# Create Invoice Screen

**Route:** `/es/invoices/new`  
**Component:** `src/app/[locale]/invoices/new/page.tsx`  
**Type:** Server Component shell + Client Component form

---

## Access

- **Create:** `requirePermission('documents.create')` — page and `createInvoiceAction` both gate on this. Roles with this permission: Owner, Admin, BillingOperator.
- **Rebuild (Corregir):** `rebuildInvoiceAction` additionally requires `documents.manage`. Only Owner and Admin have `documents.manage` (BillingOperator can create but not rebuild).

Roles without `documents.create` (Viewer, Developer) get a 404 when they navigate to `/invoices/new`. They also can't reach the rebuild form at `/invoices/new?rebuild=...` since the same page gate applies.

---

## Purpose

Multi-section form for creating an electronic invoice. Maps to `POST /api/documents`. Also doubles as the "Corregir" (rebuild) form for `RETURNED`/`NOT_AUTHORIZED` documents via `?rebuild=<accessKey>` — see "Rebuild mode" below. On success, redirects to the Invoice Detail screen for the document.

---

## API calls

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/documents` | Create and sign invoice |
| POST | `/api/documents/:key/rebuild` | Rebuild mode only — correct and re-sign an existing `RETURNED`/`NOT_AUTHORIZED` document, same accessKey/sequential |

---

## Form sections

### 0. Invoice header

| Field | Required | Notes |
|---|---|---|
| Issue date (issueDate) | — | Read-only; today's date, except in rebuild mode (see below) where it shows the document's original issue date. SRI only accepts today for new documents; rebuild always preserves the original date regardless of what's sent. |
| Delivery note (guiaRemision) | No | Format `NNN-NNN-NNNNNNNNN` (e.g. `001-001-000000001`) |

### 1. Buyer (Adquirente)

| Field | Required | Notes |
|---|---|---|
| ID type (idType) | Yes | Select: 04 RUC / 05 Cédula / 06 Pasaporte / 07 Consumidor Final / 08 Id. exterior |
| ID number (id) | Yes | Max 20 chars |
| Legal name (name) | Yes | Max 300 chars |
| Address (address) | No | Max 300 chars |
| Email (email) | Yes | Valid email — receives the authorized invoice |

A search icon button next to the ID number field performs an exact `idNumber` lookup against the user's saved clients. On match, it auto-fills ID type, name, email, and address. The button is hidden when Consumidor Final is selected or the user has no saved clients. Clients are managed at `/clients`.

### 2. Line items (Detalle)

Dynamic table — at least 1 item required. Discount is an **absolute amount in USD**, not a percentage.

| Field | Required | Notes |
|---|---|---|
| Main code (mainCode) | Yes | Product/service code — also a combobox for product search (see below) |
| Auxiliary code (auxCode) | No | Secondary code; included in XML as `codigoAuxiliar` |
| Quantity | Yes | Numeric |
| Description | Yes | Max 300 chars |
| Unit price (unitPrice) | Yes | Numeric, USD |
| Rate (taxes) | Yes | Select IVA rate; auto-populates tax code + rate code + rate |
| Discount | No | Absolute USD amount (not %) |
| Line total | — | Read-only: `qty × unitPrice − discount` |

The main code field doubles as a **product search combobox** (`ProductSearch`). Typing filters the user's saved product catalog client-side; selecting an item auto-fills description, unit price, and IVA rate. The dropdown uses `createPortal` with `position: fixed` to escape the `overflow-x-auto` table wrapper. Products are managed at `/catalog`.

### 3. Payment methods (Formas de pago)

Dynamic table — at least 1 payment required. Quick-add buttons for Efectivo (01), Tarjeta de débito (16), Tarjeta de crédito (19).

| Field | Required | Notes |
|---|---|---|
| Method | Yes | SRI 2-digit codes (see `invoiceForm.paymentMethods` in messages) |
| Amount (total) | Yes | Must sum to invoice total |
| Term (term) | No | Payment term length (e.g. `30`). Maps to SRI `plazo` |
| Term unit (termUnit) | No | Time unit string, max 10 chars (e.g. `dias`). Maps to SRI `unidadTiempo` |

### 4. Additional fields (Campos adicionales)

Dynamic table — optional. Included in the XML as `infoAdicional/campoAdicional` entries (max 15).

| Field | Required | Notes |
|---|---|---|
| Name | Yes | Key for the additional field |
| Value | Yes | Value for the additional field |

### 5. Totals preview (read-only, calculated live)

| Row | Calculation |
|---|---|
| Subtotal sin impuestos | Sum of all `qty × price − discount` |
| Subtotal 15% | Sum of line nets where taxOption = `2-4` |
| Subtotal 5% | Sum of line nets where taxOption = `2-5` |
| Subtotal 0% | Sum of line nets where taxOption = `2-0` |
| Subtotal no objeto de IVA | Sum of line nets where taxOption = `2-6` |
| Subtotal exento de IVA | Sum of line nets where taxOption = `2-7` |
| Total descuento | Sum of all discount amounts |
| IVA 15% | Subtotal 15% × 0.15 |
| IVA 5% | Subtotal 5% × 0.05 |
| **Valor a pagar** | Subtotal + IVA 15% + IVA 5% |

### 6. Templates

A "Save as template" / "Load template" pair sits above the form, right-aligned. Templates are **not** sent to or read from the Comprobify API — they're stored in the app's own `document_templates` table (Prisma), scoped per tenant.

- **Save as template** — runs full form validation (same as submit) before opening a name dialog, so a saved template is always complete: buyer, line items, payment methods, and additional fields. Saving under a name that already exists shows an inline warning ("will be overwritten") rather than erroring; the save is an upsert keyed on `(tenantId, documentType, name)`.
- **Load template** — opens a picker showing each template's name plus a preview (buyer name, item descriptions, computed total) so similarly-named templates stay distinguishable without opening each one. Selecting a template calls `form.reset()` with the stored data, replacing all fields including the line item, payment, and additional-info arrays. Loading also pre-fills that template's name into the save dialog the next time it's opened, so re-saving defaults to "update" rather than "create new."
- **Delete** — a trash icon per row in the load picker opens a confirm dialog before deleting.

The `DocumentTemplate` Prisma model's `data` column stores the exact same JSON shape as `InvoiceFormData` (`src/app/actions/invoice.ts`). `documentType` defaults to `'01'` (invoices) but is a real column, not hardcoded — other SRI document types can reuse the table once they get a create flow; today only invoices have one.

---

## IVA tax options

| Display | tax code | rate code | rate |
|---|---|---|---|
| IVA 15% | 2 | 4 | 15 |
| IVA 5% | 2 | 5 | 5 |
| IVA 0% | 2 | 0 | 0 |
| No objeto de IVA | 2 | 6 | 0 |
| Exento de IVA | 2 | 7 | 0 |

---

## Zod schema (TypeScript)

The form Zod schema mirrors the API validator (`src/validators/invoice.validator.js` in `comprobify`). Client-side validation provides fast feedback before the Server Action fires.

---

## Submit buttons

Two buttons, both validating the form (React Hook Form) and opening the same confirmation dialog before anything is created. Their labels and the dialog copy switch between a create-mode and a rebuild-mode set, based on whether `rebuildFrom` is set (see "Rebuild mode" below):

| Button | Create mode | Rebuild mode | Behavior |
|---|---|---|---|
| Primary (Enter-key default) | "Firmar y Enviar" → confirms as "Enviar al SRI" | "Corregir y Enviar" → confirms as "Corregir y enviar al SRI" | Creates/rebuilds + signs the document, then a best-effort `sendToSri()` call right after. |
| Outline | "Firmar" → confirms as "Firmar comprobante" | "Corregir" → confirms as "Corregir comprobante" | Signs only — `sendToSri()` is skipped entirely. Document stays in `SIGNED` status. |

Both paths redirect to the Invoice Detail page on success. A `SIGNED` document is not a dead end: that page shows its own "Enviar" button (see `invoice-detail.md`) to send to the SRI whenever the user is ready.

### Paused issuer

If the active issuer has `canIssue: false` (paused via the "Puede emitir" toggle on `/issuers` — see `../comprobify/docs/site/en/endpoints/set-can-issue.md`), the page fetches it live from `GET /v1/issuers` and `InvoiceForm` shows an amber warning banner ("Este emisor tiene pausada la emisión...") above the issuer chip and disables both submit buttons. The guard also sits inside `openConfirmSignAndSend`/`openConfirmSignOnly` themselves (not just the button's `disabled` attribute), so pressing Enter in a field can't bypass it. `canIssue` has no local database mirror — it's read fresh on every page load, matching what the API's own `POST /api/documents`/`POST /:key/rebuild` guard (`ISSUER_ISSUING_PAUSED`) would reject anyway; this is purely the matching UI so the form doesn't let someone fill out the whole thing only to fail at submit.

## Rebuild mode (`?rebuild=<accessKey>`)

When the page is reached via `/invoices/new?rebuild=<accessKey>` (the "Corregir" button on Invoice Detail, only shown for `RETURNED`/`NOT_AUTHORIZED` documents):

1. The Server Component fetches the document and validates its status and the presence of `requestPayload`. Any failure (not found, wrong status, no `requestPayload`) silently falls back to a normal blank create form.
2. `requestPayloadToFormValues()` (`src/components/invoice-form.tsx`) converts `document.requestPayload` — the exact body the document was created/last rebuilt with — into the form's `defaultValues`, so it's pre-filled on first render with no flash of blank fields. It's the inverse of `buildCreateDocumentPayload()` in `src/app/actions/invoice.ts`.
3. The read-only "Fecha de emisión" field shows the document's **original** issue date, not today — the API ignores any `issueDate` sent on rebuild and always keeps the original.
4. Both the top header back-link and the bottom "Volver" button point at the Invoice Detail page for this document (`/invoices/:accessKey`), not the generic dashboard/documents hub.
5. Submitting calls `rebuildInvoiceAction(accessKey, data, sendAfterSigning, from)` instead of `createInvoiceAction`, which calls `POST /api/documents/:key/rebuild` — same `accessKey`/sequential, status returns to `SIGNED`.

## Success flow and `?from=` threading

```
Form submit (Server Action)
  → POST /api/documents  (or /api/documents/:key/rebuild in rebuild mode)
  → 201 Created (or 200 OK for rebuild)
  → sendAfterSigning ? best-effort sendToSri() : skipped
  → redirect('/invoices/:accessKey?from=<backTargetKey>')
  → Invoice Detail page (status: SIGNED, or RECEIVED/AUTHORIZED if sent)
```

`from` is the page's own validated `BackTargetKey` (e.g. `documents-01`, defaulting to `dashboard`) — the same value used to compute this page's own back-link. It's passed all the way through to `createInvoiceAction`/`rebuildInvoiceAction` so the **post-submit redirect** carries it too; without this, Invoice Detail's back-link would always fall back to "Panel" regardless of where the user actually started (e.g. a per-type document list). For the rebuild loop specifically, the chain is: Invoice Detail (`?from=X`) → "Corregir" link (`?rebuild=...&from=X`) → this page forwards `X` into `rebuildInvoiceAction` → redirect lands back on Invoice Detail with `?from=X` intact.

---

## Error flow

```
Form submit (Server Action)
  → POST /api/documents
  → 422 VALIDATION_ERROR
  → return { error: 'VALIDATION_ERROR', errors: [...] }
  → Form highlights invalid fields
  → Shows t('apiError.VALIDATION_ERROR')
```
