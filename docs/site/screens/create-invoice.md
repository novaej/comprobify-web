# Create Invoice Screen

**Route:** `/es/invoices/new`  
**Component:** `src/app/[locale]/invoices/new/page.tsx`  
**Type:** Server Component shell + Client Component form

---

## Purpose

Multi-section form for creating an electronic invoice. Maps to `POST /api/documents`. On success, redirects to the Invoice Detail screen for the created document.

---

## API calls

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/documents` | Create and sign invoice |

---

## Form sections

### 1. Buyer (Comprador)

| Field | Required | Notes |
|---|---|---|
| ID type (idType) | Yes | Select: 04 RUC / 05 Cédula / 06 Pasaporte / 07 Consumidor Final |
| ID number (id) | Yes | Max 20 chars |
| Name (name) | Yes | Max 300 chars |
| Email (email) | Yes | Valid email — receives the authorized invoice |
| Address (address) | No | Max 300 chars |

### 2. Line items (Productos / Servicios)

Dynamic list — at least 1 item required, user can add/remove rows.

| Field | Required | Notes |
|---|---|---|
| Main code (mainCode) | Yes | Product/service code |
| Description | Yes | Max 300 chars |
| Quantity | Yes | Numeric |
| Unit price (unitPrice) | Yes | Numeric, USD |
| Discount (%) | No | Numeric |
| VAT (taxes) | Yes | Select IVA rate; auto-populates tax code + rate code + rate |

### 3. Payment

| Field | Required | Notes |
|---|---|---|
| Method | Yes | SRI 2-digit codes (see `invoiceForm.paymentMethods` in messages) |
| Amount (total) | Yes | Must equal invoice total |
| Term (days) | No | Payment term in days |

### 4. Totals preview (read-only, calculated live)

Shown as a summary card:
- Subtotal sin IVA
- Descuento
- Base imponible  
- IVA (15%, 5%, 0%, etc.)
- **Total** (bold)

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

The form Zod schema must mirror the API validator (`src/validators/invoice.validator.js` in `comprobify`). Any validation the API does should also be done client-side for fast feedback.

---

## Success flow

```
Form submit (Server Action)
  → POST /api/documents
  → 201 Created
  → redirect('/invoices/:accessKey')
  → Invoice Detail page (status: SIGNED)
```

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
