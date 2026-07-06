# Super Admin Panel (`/admin`)

## Purpose

Internal tool for Comprobify staff to manage tenants and review payment proofs. Not visible to regular users — gated by `isSuperAdmin: true` on the `User` row.

## Access

- `User.isSuperAdmin === true` only (`requireSuperAdmin()` in `src/lib/admin-context.ts`)
- Anyone else is redirected to `/dashboard`
- No nav link — reached by typing the URL directly
- Calls the Comprobify API's `/admin/*` routes authenticated with `COMPROBIFY_ADMIN_SECRET` (not the tenant API key)

## Layout

Standard locale layout with nav, but a separate `AdminNav` (`src/components/admin-nav.tsx`) replaces the normal sidebar links with two tabs: **Emisores** (tenants) and **Pagos** (payments).

`/admin` itself is a redirect to `/admin/tenants`.

---

## `/admin/tenants`

### Purpose

List all tenants registered in the system with controls to manually manage their plan, status, and verification.

### Components

| Component | File |
|-----------|------|
| `AdminTenantManager` | `src/components/admin-tenant-manager.tsx` |

### Data

| Source | Description |
|--------|-------------|
| `listTenants()` | `GET /admin/tenants` — full tenant list with `id`, `ruc`, `businessName`, `status`, `tier`, `environment` |

### Actions

All actions use Server Actions in `src/app/actions/admin.ts`, which call `src/lib/admin-api.ts`:

| Action | API call | Notes |
|--------|----------|-------|
| **Update tier** | `PATCH /admin/tenants/:id` `{ tier }` | Changes the tenant's plan quota immediately without creating a subscription |
| **Update status** | `PATCH /admin/tenants/:id` `{ status }` | Values: `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED` |
| **Verify tenant** | `POST /admin/tenants/:id/verify` | Marks the tenant as verified (separate from status) |

### Behavior

- Tier and status are inline `<Select>` dropdowns in the table row; changes call the Server Action immediately on change (no confirm dialog).
- `isPending` state per row prevents overlapping mutations.
- All mutations use `startTransition` and toast on success/error.

---

## `/admin/payments`

### Purpose

Queue of payment proofs submitted by tenants awaiting manual review. The admin verifies or rejects each payment, which triggers the subscription lifecycle on the API side (`PAYMENT_RECEIVED → INVOICE_PROCESSING → ACTIVE` on verify; `REJECTED` on reject).

### Components

| Component | File |
|-----------|------|
| `AdminPaymentManager` | `src/components/admin-payment-manager.tsx` |

### Data

| Source | Description |
|--------|-------------|
| `listPendingPayments('REPORTED')` | `GET /admin/payments?status=REPORTED` — payments with uploaded proof awaiting decision |

### Actions

| Action | API call | Notes |
|--------|----------|-------|
| **Verify** | `POST /admin/payments/:id/review` `{ decision: 'VERIFIED' }` | Triggers subscription activation on the API |
| **Reject** | `POST /admin/payments/:id/review` `{ decision: 'REJECTED', rejectionReasonCode, rejectionReasonDetail }` | Requires a free-text rejection reason; shown in a dialog before confirming |

### Behavior

- Each payment card shows: tenant name, amount, purpose (`SUBSCRIPTION`/`RENEWAL`/`TIER_CHANGE`), proof file link, submitted date.
- **Verify** fires immediately on button click (no confirm dialog).
- **Reject** opens a `Dialog` with a `<Textarea>` for the rejection reason; the confirm button is disabled until the reason is non-empty.
- On success (verify or reject), the payment is removed from the list optimistically.
- The page only shows `REPORTED` payments (proof uploaded, awaiting decision) — `PENDING_PAYMENT` (no proof yet) and already-decided payments are not shown.

## i18n Namespaces

- `admin.tenants` — keys: `title`, `description`, `tierUpdated`, `statusUpdated`, `verified`, column headers
- `admin.payments` — keys: `title`, `description`, `verified`, `rejected`, `rejectReason`, dialog labels

## Security Notes

- `requireSuperAdmin()` checks `ctx.user.isSuperAdmin` after a full `requireContext()` call; there is no permission code for this — it's a direct boolean field.
- `COMPROBIFY_ADMIN_SECRET` must match the API's own `ADMIN_SECRET`. It is never exposed to the browser.
- The proof file download link (`GET /api/admin/payments/:id/proof`) is a proxied route handler that fetches from the Comprobify API using `COMPROBIFY_ADMIN_SECRET` server-side.
