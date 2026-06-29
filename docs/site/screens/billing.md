# Billing Screen

**Route:** `/es/settings/billing`
**Component:** `src/app/[locale]/settings/billing/page.tsx`
**Type:** Server Component

---

## Purpose

Subscription and payment management — current plan, starting a subscription, changing tier, uploading SPI transfer proof, and subscription/payment history. Reached from a card on `/settings`.

Access: `billing.read` to view (Owner, Admin, BillingOperator); `billing.manage` to act — upload proof, subscribe, or change tier (same three roles). `tenant.promote` (the sandbox→production flip itself) stays a separate, Owner-only permission on `/settings`.

Unlike the rest of the production-promotion flow, this screen works **in both sandbox and production** — `comprobify`'s `POST /v1/subscriptions` lets a tenant start paying for a tier before ever promoting, since the manual proof/review pipeline doesn't depend on environment.

---

## Data fetched (server-side)

- `getCurrentTenant()` — current `subscriptionTier`/`documentCount`/`documentQuota`
- `getMySubscriptions()` — full subscription history, newest first, each with nested `payments`
- `listTiers()` — public tier catalog, used to render the subscribe/change-tier pickers with live prices
- `Tenant.pendingBankTransfer` (Prisma) — the cached bank-transfer details from whichever call last started a payment (see "Bank transfer caching" below)

If the latest payment for the latest subscription is `VERIFIED`, the page clears `pendingBankTransfer` back to `Prisma.JsonNull` (best-effort, non-blocking) — it's no longer needed once the tenant's part is done.

---

## Sections (rendered by `billing-manager.tsx`)

### 1. Sandbox notice

Shown only when `ctx.tenant.environment === 'sandbox'` — explains that subscribing now still works and will simply take effect in production once the tenant promotes.

### 2. Current plan card

Tier name (resolved through the `pricing` i18n namespace, same labels as `/pricing`), `{count} of {quota}` document usage, monthly price if not FREE. If the active subscription has a `pending_tier` (a scheduled downgrade), shows "Tu plan bajará a X el {date}" using `current_period_end`.

### 3. Pending payment card

Shown when the latest subscription's latest payment isn't yet `VERIFIED` (and the subscription isn't `CANCELLED`). Title and amount adapt to `payment.purpose` (`INITIAL` vs `TIER_CHANGE`, the latter naming the target tier). Shows `rejection_reason` when present, the cached bank-transfer details (or a "contact support" fallback if `pendingBankTransfer` is `null` — e.g. an admin-initiated subscription the tenant never saw the response for), and a file input + upload button (`billing.manage` only) that calls `submitPaymentProofAction`.

### 4. Subscribe card

Shown when there is no subscription in flight (none yet, or the only ones are `CANCELLED`) and `billing.manage` is held. A tier `Select` (STARTER/GROWTH/BUSINESS) + monthly/yearly toggle + confirm step, calling `createSubscriptionAction(tier, billingInterval)`. Disabled with a hint if `ctx.user.emailVerified` is `false` (the API requires a verified email — same gate as promotion).

### 5. Change tier card

Shown when the latest subscription is `ACTIVE`, no payment is pending, and no downgrade is already scheduled. A tier `Select` (the other two paid tiers, excluding the current one) + confirm step, calling `changeTierAction(tier)`. The result varies:
- **Upgrade, payment owed** — toast + the pending-payment card appears with bank details on the next render.
- **Upgrade, prorates to $0** (almost no time left in the period) — applied immediately, no payment step.
- **Downgrade** — scheduled for `current_period_end`, no payment owed; surfaces as the "plan bajará" notice on the current-plan card.

### 6. Subscription history

Every subscription (newest first) with its nested payments, each as a small status badge (`subscriptionStatus.*`/`paymentStatus.*` i18n). A `TIER_CHANGE` payment additionally shows "Cambio a {tier}".

---

## Bank transfer caching

`bankTransfer` (bank name, account type/number, holder, identification) is **only ever returned once**, in the JSON response of whichever call started the payment that needs it — `promoteTenant()`, `createSubscription()`, or `changeTier()`. There is no endpoint to re-fetch it later. All three corresponding Server Actions (`promoteTenantAction`, `createSubscriptionAction`, `changeTierAction`) write it onto `Tenant.pendingBankTransfer` (a Prisma `Json?` column) in the same call, so this page can keep showing it across visits until the payment is verified. See `CLAUDE.md` Common Mistake #34 for the Prisma `Json` write gotchas this required.

---

## Self-service limits

No self-service path exists to **cancel** a subscription (admin-only `PATCH /v1/admin/subscriptions/:id/cancel`), and a downgrade already scheduled (or an upgrade payment already in flight) blocks requesting another change until it resolves (`409 TIER_CHANGE_ALREADY_PENDING`) — the UI hides the change-tier card in that state rather than letting the request fail.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/billing/page.tsx` | Server Component — data fetching, `pendingBankTransfer` clear-on-verified logic |
| `src/components/billing-manager.tsx` | Client Component — all sections above (`SubscribeCard`/`ChangeTierCard`/`PendingPaymentCard` are local to this file) |
| `src/app/actions/billing.ts` | `submitPaymentProofAction`, `createSubscriptionAction`, `changeTierAction` |
| `src/lib/api.ts` | `getMySubscriptions`, `submitPaymentProof`, `createSubscription`, `changeTier`, `promoteTenant` (tier/billingInterval), `ApiSubscriptionInfo`/`ApiPaymentInfo`/`ApiBankTransferInfo` types |
| `src/lib/public-api.ts` | `listTiers()` — public tier catalog |
| `src/lib/subscription-tiers.ts` | `PaidTier`/`BillingInterval` shared types |
| `src/lib/rbac.ts` | `billing.read`/`billing.manage` permissions |
