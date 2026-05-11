# Clients Screen

**Route:** `/[locale]/clients`  
**Auth:** Required (session). Visible in nav only when `hasIssuer` is true.

---

## Purpose

Lets users save frequent clients (buyers) so they can pre-fill the buyer section of the invoice form by typing the client's ID number and clicking the search icon.

---

## Data

Clients are stored in the app's own `clients` table (Prisma), scoped per user via `userId`. Every read and write is filtered by `userId` — a user cannot access another user's clients.

**Fields stored per client:**

| Field | Required | Notes |
|---|---|---|
| `idType` | Yes | SRI ID type code (e.g. `05` = Cédula). Consumidor Final (`07`) excluded — not a real client. |
| `idNumber` | Yes | The actual RUC, cédula, passport, or foreign ID. Max 20 chars. |
| `name` | Yes | Legal name / razón social. |
| `email` | Yes | Used as the recipient address when the invoice is emailed. |
| `address` | No | Optional address field. |

---

## Layout

### List view

Full-width table (wrapped in `overflow-x-auto`) with columns: ID type, ID number, Name, Email, Address, Actions. Sorted alphabetically by name.

- Empty state: centered message with a prompt to add the first client.
- "Add client" button (top-right) opens the add dialog.
- Each row has an edit (pencil) and delete (trash) icon button.

### Add / Edit dialog (`sm:max-w-lg`)

React Hook Form + Zod. Fields:
- ID type (Select — static list from `invoiceForm.idTypes`, excludes Consumidor Final)
- ID number (text, required, max 20)
- Legal name (text, required)
- Email (email input, required)
- Address (text, optional)

On submit: calls `createClientAction` or `updateClientAction`, then `router.refresh()`.

### Delete confirmation dialog (`sm:max-w-sm`)

Shows ID number + name. "Delete" button calls `deleteClientAction`, then `router.refresh()`.

---

## Server Actions

All in `src/app/actions/clients.ts`. All actions call `auth()` to obtain `userId` and scope every DB operation to that user:

| Action | Description |
|---|---|
| `createClientAction(input)` | Insert a new client row |
| `updateClientAction(id, input)` | Update via `updateMany` (scoped to userId) |
| `deleteClientAction(id)` | Delete via `deleteMany` (scoped to userId) |

---

## Invoice form integration

On the invoice creation page, all clients for the session user are fetched server-side alongside the SRI catalogs (ordered by name) and passed as `catalogs.clients: SavedClient[]`.

In the buyer section, a search icon button (`Search` from lucide) appears to the right of the ID number field when:
- There are saved clients (`catalogs.clients.length > 0`), and
- The selected ID type is not Consumidor Final.

**Lookup logic (exact match on `idNumber`):**
1. User types the client's ID number in the buyer ID field.
2. Clicks the search icon button.
3. The form looks for a client where `client.idNumber === trimmed field value`.
4. If found: sets `buyer.idType`, `buyer.name`, `buyer.email`, `buyer.address`.
5. If not found: does nothing (the user can continue filling manually).
