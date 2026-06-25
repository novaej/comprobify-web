# Create Credit Note Screen

**Route:** `/es/credit-notes/new`  
**Component:** `src/app/[locale]/credit-notes/new/page.tsx`  
**Type:** Server Component shell + Client Component form

---

## Purpose

Form for creating a credit note (Nota de Crédito, document type `04`) that references a previously authorized invoice. Maps to `POST /api/documents` (same endpoint as Create Invoice — the request shape is selected by `documentType`). Also doubles as the "Corregir" (rebuild) form for `RETURNED`/`NOT_AUTHORIZED` credit notes via `?rebuild=<accessKey>`, and accepts `?fromInvoice=<accessKey>` to pre-fill from a specific invoice. On success, redirects to the (shared) Invoice Detail screen for the document.

Kept as a separate form from Create Invoice rather than reusing `InvoiceForm` — the request shape differs too much to share: no `payments` block; instead requires `originalDocument: { documentType, number, issueDate }` (the document being credited) and `motivo` (reason). Item/tax shape is otherwise identical to invoices and reuses the same `ProductSearch` combobox (`src/components/product-search.tsx`, shared with `InvoiceForm`).

---

## API calls

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/documents` | Create and sign credit note (`documentType: '04'`) |
| POST | `/api/documents/:key/rebuild` | Rebuild mode only — correct and re-sign an existing `RETURNED`/`NOT_AUTHORIZED` credit note |
| GET | `/api/documents/:key` (via `getInvoiceForCreditNoteAction`) | Resolve an invoice's `originalDocument`/buyer/items for pre-fill |
| GET | `/api/documents?documentType=01&status=AUTHORIZED&sequential=...` (via `searchCreditableInvoicesAction`) | "Buscar comprobante" picker |

---

## Two ways to start

| Entry point | How it arrives | What's pre-filled |
|---|---|---|
| From an invoice's detail page | "Crear nota de crédito" in the Acciones dropdown on an `AUTHORIZED` type-`01` document (see `invoice-detail.md`) → `/credit-notes/new?fromInvoice=<accessKey>` | `originalDocument`, buyer, and items — fetched server-side before first render |
| Standalone (documents hub) | The "+ Nuevo" tile on `/documents` or `/documents/04` → `/credit-notes/new` | Nothing — the form opens with a "Buscar comprobante" prompt instead |

Either way, every pre-filled field stays editable afterward — including replacing the items entirely, for a credit note that doesn't track specific products (e.g. a flat monetary adjustment: a manual `mainCode`/description with the credited amount as `unitPrice`).

### Original document number reconstruction

The Comprobify API has no endpoint to look up a document by its `NNN-NNN-NNNNNNNNN` number — only by access key. So `originalDocument.number` is **always** reconstructed server-side (`getInvoiceForCreditNoteAction`, `src/app/actions/credit-note.ts`) as `${issuer.branchCode}-${issuer.issuePointCode}-${document.sequential}`, never typed by hand by the user, and only ever for `AUTHORIZED` type-`01` documents belonging to the active issuer.

### "Buscar comprobante" picker

A dialog inside `CreditNoteForm` itself (not shown during rebuild). Typing a (partial) invoice number calls `searchCreditableInvoicesAction`, which lists `AUTHORIZED` type-`01` documents matching that sequential. Selecting a result calls the same `getInvoiceForCreditNoteAction` used by the `?fromInvoice=` entry point, populating `originalDocument`, buyer, and items in one shot. A "Buscar otro" button next to the populated `originalDocument` summary re-opens the same dialog to change the selection.

---

## Form sections

### 0. Header

| Field | Required | Notes |
|---|---|---|
| Issue date (issueDate) | — | Read-only; today's date, except in rebuild mode where it shows the document's original issue date — same rule as invoices. |

### 1. Comprobante a corregir (originalDocument)

Not free-text inputs — populated only via the `?fromInvoice=` pre-fill or the "Buscar comprobante" picker (see above). Shows the resolved `number` and `issueDate` once set; shows a validation error ("Seleccione el comprobante a corregir") if the user tries to submit without selecting one.

### 2. Buyer (Adquirente)

Identical fields/behavior to Create Invoice's buyer section (ID type, ID number with saved-client search, legal name, address, email) — see `create-invoice.md` § 1.

### 3. Line items (Detalle)

Identical fields/behavior to Create Invoice's line items table (`ProductSearch` combobox, IVA rate select, absolute-USD discount) — see `create-invoice.md` § 2. No payments section.

### 4. Motivo

| Field | Required | Notes |
|---|---|---|
| Motivo | Yes | Free text, max 300 chars. No predefined catalog — the SRI doesn't enforce one. |

### 5. Totals preview

Same calculation as Create Invoice § 5 (Subtotal sin impuestos / IVA 15% / IVA 5% / etc. → Valor a pagar), computed from the credit note's own items.

### 6. Additional fields (Campos adicionales)

Identical to Create Invoice § 4.

---

## Submit buttons

Same dual-button / confirmation-dialog mechanism as Create Invoice (see `create-invoice.md` → "Submit buttons"), with labels swapped to credit-note wording (`creditNoteForm` i18n namespace) and `*Rebuild`-suffixed variants when `rebuildFrom` is set:

| Button | Create mode | Rebuild mode | Behavior |
|---|---|---|---|
| Primary | "Firmar y Enviar" | "Corregir y Enviar" | Creates/rebuilds + signs, then a best-effort `sendToSri()`. |
| Outline | "Firmar" | "Corregir" | Signs only — stays in `SIGNED` status. |

Both paths redirect to the (shared) Invoice Detail page on success.

## Rebuild mode (`?rebuild=<accessKey>`)

Same mechanism as Create Invoice's rebuild mode (see `create-invoice.md` → "Rebuild mode"), reached from a `RETURNED`/`NOT_AUTHORIZED` credit note's "Corregir" button on Invoice Detail. The page validates `document.requestPayload.documentType === '04'` before treating it as a credit-note rebuild (so a malformed/foreign `rebuild` param can't accidentally load an invoice payload into this form).

---

## Success flow and `?from=` threading

```
Form submit (Server Action)
  → POST /api/documents  (or /api/documents/:key/rebuild in rebuild mode)
  → 201 Created (or 200 OK for rebuild)
  → sendAfterSigning ? best-effort sendToSri() : skipped
  → redirect('/invoices/:accessKey?from=<backTargetKey>')
  → Invoice Detail page (status: SIGNED, or RECEIVED/AUTHORIZED if sent)
```

`from` follows the same allowlisted-`BackTargetKey` pattern as Create Invoice — see `create-invoice.md` → "Success flow and `?from=` threading".
