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
- `Tenant.pendingBankTransfer` (Prisma) — the cached bank-transfer details from whichever call last started a payment (see "Bank transfer caching" below) — kept indefinitely, never cleared

---

## Sections (rendered by `billing-manager.tsx`)

### 1. Sandbox notice

Shown only when `ctx.tenant.environment === 'sandbox'` — explains that subscribing now still works and will simply take effect in production once the tenant promotes.

### 2. Current plan card

Tier name (resolved through the `pricing` i18n namespace, same labels as `/pricing`), `{count} of {quota}` document usage, monthly price if not FREE. If the active subscription has a `pending_tier` (a scheduled downgrade), shows "Tu plan bajará a X el {date}" using `current_period_end`.

### 3. Pending payment card

Shown when the latest subscription's latest payment isn't yet `VERIFIED` (and the subscription isn't `CANCELLED`/`EXPIRED`). Title and amount adapt to `payment.purpose` (`INITIAL`, `TIER_CHANGE` naming the target tier + interval when it also changed, or `RENEWAL`). Amount is displayed as the IVA-inclusive total (`payment.total_amount`) with an "IVA incluido" label, falling back to `payment.amount` when `total_amount` is absent (same-interval downgrade carries no payment at all). When a payment is `REJECTED`, shows `payment.rejection_reason_code` mapped to a localized message — codes: `AMOUNT_MISMATCH`, `TRANSFER_NOT_FOUND`, `WRONG_ACCOUNT`, `ILLEGIBLE_PROOF`, `DUPLICATE_SUBMISSION`, `OTHER`.

`billing.manage` users see a **"Transferencia"/"Tarjeta" tab toggle** (ADR-028) — see "Card payments (Payphone)" below. The Transferencia tab is the pre-existing flow: cached bank-transfer details (or a "contact support" fallback if `pendingBankTransfer` is `null` — e.g. an admin-initiated subscription the tenant never saw the response for), and a file input + upload button that calls `submitPaymentProofAction`. A renewal's payment is opened by a backend cron job, not any call this screen makes, so it always relies on the cached bank details rather than a fresh response — see "Bank transfer caching." `billing.read`-only users never see the toggle and always get the read-only Transferencia view, same as before this feature.

### 4. Subscribe card

Shown when there is no subscription in flight (none yet, or the only ones are `CANCELLED`) and `billing.manage` is held. Renders a **monthly/yearly interval toggle** (pill toggle matching `/pricing`) + a **card grid** of the three paid tiers (STARTER/GROWTH/BUSINESS) each showing name, price for the selected interval, IVA note, and document quota — the same visual language as the pricing page. Selecting a card highlights it; confirming calls `createSubscriptionAction(tier, billingInterval)`. Disabled with a hint if `ctx.user.emailVerified` is `false` (the API requires a verified email — same gate as promotion).

### 5. Change tier card

Shown when the latest subscription is `ACTIVE`, no payment is pending, and no downgrade is already scheduled. Renders the same **interval toggle + card grid** as Subscribe, but includes all three paid tiers (not filtered) and marks the current plan as locked/greyed when the current billing interval is selected — so switching interval while staying on the same tier is a valid selection. Selecting the same tier at the same interval is treated as a no-op and the confirm button is disabled with a hint.

**In production**, the API's three-scenario behavior is surfaced as contextual hints in the confirm step:

- **Same-interval upgrade** (higher-priced tier, interval unchanged) — payment required, prorated for the fraction of the current period remaining. Calls `changeTierAction(tier)` (no interval). If the prorated amount rounds to $0, applies immediately with no payment.
- **Same-interval downgrade** (lower-priced tier, interval unchanged) — scheduled for `current_period_end`, no payment owed. Calls `changeTierAction(tier)` (no interval).
- **Interval change** (different interval, regardless of tier direction) — deferred to `current_period_end`, billed at the new tier+interval's full price. Calls `changeTierAction(tier, newInterval)`. The subscription's `billing_interval` does not flip until the period ends.

**In sandbox, none of the above applies** — `requestSandboxTierChange` on the API side ignores the upgrade/downgrade/interval-change distinction entirely and only checks whether the target tier is cheaper: a downgrade (by monthly price, regardless of interval) applies **immediately for free**; anything else — an upgrade, or even a same-tier interval-only change — charges the new tier's **full sticker price immediately**, with no proration against a period that doesn't meaningfully exist yet and no deferral. `ChangeTierCard` shows dedicated `confirmHintSandboxCharge`/`confirmHintSandboxFree` copy for this (picked via `isTierDowngrade` alone, same condition the API branches on) instead of the three production hints above — see CLAUDE.md Common Mistake #55 for the bug this fixed (a sandbox upgrade previously said "cobro proporcional"/prorated while actually charging full price).

### 6. Subscription history

Every subscription (newest first) with its nested payments, each as a small status badge (`subscriptionStatus.*`/`paymentStatus.*` i18n — covers the full `PENDING_PAYMENT`/`PAYMENT_RECEIVED`/`INVOICE_PROCESSING`/`ACTIVE`/`EXPIRED`/`SUSPENDED`/`CANCELLED` set). `PAYMENT_RECEIVED`/`INVOICE_PROCESSING` are legacy statuses from before ADR-027 — nothing writes them any more (a `VERIFIED` payment now activates its subscription immediately), but old rows can still carry them, so the badge styling stays. A `TIER_CHANGE` payment additionally shows "Cambio a {tier}", or "Cambio a {tier} ({interval})" when `target_billing_interval` is present (an interval change); a `RENEWAL` payment shows "Renovación".

---

## Card payments (Payphone)

`billing.manage` users can settle any pending payment by card instead of bank transfer, via
Payphone's *Cajita de Pagos* widget (ADR-028) — see `docs/guides/payphone-payments.md` for the full
flow. Selecting the "Tarjeta" tab mints a session (`createPayphoneSessionAction`, only on that
click, not eagerly — minting also flips the payment's `method`) and renders the widget
(`PayphoneCheckout`). A `503 PAYMENT_GATEWAY_NOT_CONFIGURED` shows an inline fallback and a button
back to Transferencia — the environment simply has no Payphone credentials configured, which is a
supported state, not an error. A `400 PAYPHONE_AMOUNT_BELOW_MINIMUM` (Payphone refuses charges under
$1.00 — reachable via a small prorated tier-change upgrade) shows the same fallback pattern.

Once the payer submits card details, Payphone takes over entirely: it redirects the browser away
from this screen to `/es/payphone/return`, which confirms the charge and shows the outcome
(approved / declined / duplicate / unresolved). Nothing on this screen tracks that outcome directly
— a successful confirm revalidates `/settings/billing`, so returning here (via the return page's
"Ir a Facturación" button) shows the updated plan/quota immediately.

---

## Renewals

A renewal reuses the exact same proof/review/link-invoice pipeline as the initial subscription — `comprobify`'s scheduled job opens a new `payments` row (`purpose: 'RENEWAL'`, no `target_tier`) on the existing `ACTIVE` subscription about 7 days before `current_period_end`. The tenant finds out only via the `SUBSCRIPTION_RENEWAL_DUE` notification/email (see "Notifications" below) and an email with the bank transfer instructions — there is no Server Action call on this screen that starts a renewal payment, so it never gets its own fresh `bankTransfer` response (see "Bank transfer caching"). Uploading proof against the renewal's `payment.id` works through the identical `submitPaymentProofAction` flow as any other payment. Partway through the grace period that follows — before anything else happens — a second, more urgent `SUBSCRIPTION_PAST_DUE_WARNING` notification/email fires (ADR-025 on the API side). If it still runs unpaid past the full grace period, the subscription moves to `EXPIRED`, the tenant is auto-downgraded to FREE, **and the tenant's account itself (`tenants.status`) becomes `PAST_DUE`** (`SUBSCRIPTION_EXPIRED` notification/email covers both) — the Subscribe card reappears at that point since an `EXPIRED` subscription doesn't block starting a new one, and starting + paying for that new subscription is also exactly what clears the account back out of `PAST_DUE` (see "Account status" below).

---

## Account status: `PAST_DUE`

A `PAST_DUE` account (see CLAUDE.md's "Tenant account status" entry) shows an amber `PastDueBanner` (`src/components/past-due-banner.tsx`, rendered in `[locale]/layout.tsx`) on every page, not just this one — but this screen is where it's resolved: starting a fresh subscription (`POST /v1/subscriptions`) and submitting its payment proof (`PATCH /v1/payments/:id/proof`) are the only two write routes the API keeps reachable while `PAST_DUE`, i.e. exactly the **Subscribe card** and **Pending payment card** flows above. Landing on this page also opportunistically corrects the local `Tenant.status` mirror the banner reads from (`reconcileTenantStatus()`, called right after this page's own `getCurrentTenant()`) — so a tenant who already paid and was flipped back to `ACTIVE` server-side sees the banner disappear on their very next visit here, not stuck showing forever.

---

## Notifications

Payment decisions and the renewal lifecycle fire real notifications instead of leaving the tenant to poll: `PAYMENT_VERIFIED`/`PAYMENT_REJECTED` on every `reviewPayment` decision (regardless of `purpose`), `SUBSCRIPTION_RENEWAL_DUE`/`SUBSCRIPTION_PAST_DUE_WARNING`/`SUBSCRIPTION_EXPIRED` from the renewal job, and `PRICE_CHANGE_ANNOUNCED` (mandatory, no opt-out) when a published tier price change enters its 30-day notice window. The first five are "live" toggleable types in `/settings/notifications` (see `docs/site/screens/notifications.md`); `PRICE_CHANGE_ANNOUNCED` is mandatory instead. All six route to this screen when clicked (`getNotificationHref()` in `src/lib/notification-link.ts`). Since ADR-027, `PAYMENT_VERIFIED` firing *is* the activation notification — verification grants access immediately, so there's no longer a separate "the self-billed invoice authorized" event to wait for.

---

## Bank transfer caching

`bankTransfer` (bank name, account type/number, holder, identification) is **only ever returned once**, in the JSON response of whichever call started a payment that needs it — `promoteTenant()`, `createSubscription()`, or `changeTier()`. There is no endpoint to re-fetch it, and a renewal payment never returns one at all (it's opened by a backend job, not a call from this app). All three corresponding Server Actions (`promoteTenantAction`, `createSubscriptionAction`, `changeTierAction`) write it onto `Tenant.pendingBankTransfer` (a Prisma `Json?` column) in the same call. Because the bank details are static, env-configured data on the API — identical for every tenant and every payment — this cache is kept **indefinitely**, not cleared after a payment verifies; clearing it would leave every later renewal (which can never repopulate it) with nothing to show. See `CLAUDE.md` Common Mistake #34 for the Prisma `Json` write gotchas this required.

---

## Self-service limits

No self-service path exists to **cancel** a subscription (admin-only `PATCH /v1/admin/subscriptions/:id/cancel`), and a downgrade already scheduled (or an upgrade payment already in flight) blocks requesting another change until it resolves (`409 TIER_CHANGE_ALREADY_PENDING`) — the UI hides the change-tier card in that state rather than letting the request fail.

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/billing/page.tsx` | Server Component — data fetching; reads (never clears) `Tenant.pendingBankTransfer`; calls `reconcileTenantStatus()` after `getCurrentTenant()` |
| `src/components/billing-manager.tsx` | Client Component — all sections above (`SubscribeCard`/`ChangeTierCard`/`PendingPaymentCard` are local to this file) |
| `src/components/payphone-checkout.tsx` | Client Component — loads Payphone's Cajita de Pagos CDN assets, renders the `PPaymentButtonBox` widget for one minted session (ADR-028) |
| `src/app/[locale]/payphone/return/page.tsx` | Confirms a card charge unconditionally on load and renders the outcome — see `docs/guides/payphone-payments.md` |
| `src/app/actions/billing.ts` | `submitPaymentProofAction`, `createSubscriptionAction`, `changeTierAction`, `createPayphoneSessionAction`, `confirmPayphonePaymentAction` |
| `src/lib/api.ts` | `getMySubscriptions`, `submitPaymentProof`, `createSubscription`, `changeTier`, `promoteTenant` (tier/billingInterval), `createPayphoneSession`, `confirmPayphonePayment`, `ApiSubscriptionInfo`/`ApiPaymentInfo`/`ApiBankTransferInfo`/`ApiPayphoneSession`/`ApiPayphoneConfirmResult` types, `ApiTenantInfo.status` (includes `PAST_DUE`) |
| `src/lib/public-api.ts` | `listTiers()` — public tier catalog |
| `src/lib/subscription-tiers.ts` | `PaidTier`/`BillingInterval` shared types |
| `src/lib/rbac.ts` | `billing.read`/`billing.manage` permissions |
| `src/lib/notification-link.ts` | Routes `PAYMENT_VERIFIED`/`PAYMENT_REJECTED`/`SUBSCRIPTION_RENEWAL_DUE`/`SUBSCRIPTION_PAST_DUE_WARNING`/`SUBSCRIPTION_EXPIRED`/`PRICE_CHANGE_ANNOUNCED` notifications here |
| `src/lib/tenant-status-sync.ts` | `syncTenantStatusFromError()`/`reconcileTenantStatus()` — keeps the local `Tenant.status` mirror (drives `PastDueBanner`/`SuspendedBanner`) in sync |
| `src/components/past-due-banner.tsx` | Amber banner shown when `Tenant.status === 'PAST_DUE'`, rendered in `[locale]/layout.tsx` |
