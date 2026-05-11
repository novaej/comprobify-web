# Product Catalog Screen

**Route:** `/[locale]/catalog`  
**Auth:** Required (session). Visible in nav only when `hasIssuer` is true.

---

## Purpose

Lets users save frequently used products and services so they can pre-fill line items in the invoice form by typing a code or description.

---

## Data

Products are stored in the app's own `products` table (Prisma), scoped per user. They are **not** sent to or read from the Comprobify API.

**Fields stored per product:**

| Field | Required | Notes |
|---|---|---|
| `mainCode` | Yes | Max 25 chars. Maps to `codigoPrincipal` in SRI XML. |
| `auxCode` | No | Max 25 chars. Maps to `codigoAuxiliar`. |
| `description` | Yes | Product name shown in the invoice. |
| `unitPrice` | Yes | Default price. Editable per invoice line. |
| `taxOption` | Yes | IVA rate code (e.g. `2-4` = 15%). |

**Excluded from catalog (vs. SRI product form):**
- ICE (Impuesto a los Consumos Especiales) — the invoice form does not support ICE yet.
- IVA turismo — not supported by the invoice form.
- Per-product `infoAdicional` — no per-item notes field in the invoice form.

---

## Layout

### List view

Full-width table (wrapped in `overflow-x-auto`) with columns: Main code, Aux. code, Description, Price, IVA, Actions.

- Empty state: centered message with a prompt to add the first product.
- "Add product" button (top-right) opens the add dialog.
- Each row has an edit (pencil) and delete (trash) icon button.

### Add / Edit dialog (`sm:max-w-lg`)

React Hook Form + Zod. Fields:
- Main code (text, required, max 25)
- Aux. code (text, optional, max 25)
- Description (text, required)
- Unit price (text, decimal regex)
- IVA rate (Select, options from static `IVA_OPTIONS` constant using `invoiceForm.taxOptions` labels)

On submit: calls `createProductAction` or `updateProductAction`, then `router.refresh()`.

### Delete confirmation dialog (`sm:max-w-sm`)

Shows product code + description. "Delete" button calls `deleteProductAction`, then `router.refresh()`.

---

## Server Actions

All in `src/app/actions/catalog.ts`:

| Action | Description |
|---|---|
| `listProductsAction()` | List all products for the session user (unused — page fetches directly from DB) |
| `createProductAction(input)` | Insert a new product row |
| `updateProductAction(id, input)` | Update an existing row (scoped to userId via `updateMany`) |
| `deleteProductAction(id)` | Delete a row (scoped to userId via `deleteMany`) |

---

## Invoice form integration

On the invoice creation page, the server fetches all user products alongside the SRI catalogs and passes them as `catalogs.products: CatalogProduct[]` to `InvoiceForm`.

The `mainCode` input in each line-item row is replaced by a `ProductSearch` combobox:
- Filters products by code or description as the user types (client-side, up to 7 results).
- Selecting a product fills: `mainCode`, `auxCode`, `description`, `unitPrice`, `taxOption`.
- The dropdown is rendered via `createPortal(…, document.body)` with `position: fixed` to escape the `overflow-x-auto` table container.
