# Card Payments via Payphone — the Frontend Side

Tenants can pay a subscription payment (`INITIAL`, `TIER_CHANGE`, or `RENEWAL`) by card through
Payphone's *Cajita de Pagos* widget, alongside the existing manual SPI bank transfer, from
`/settings/billing`. This guide covers what **this repo** does — minting a session, rendering the
widget, and confirming the charge on the return page. The API owns the money truth (capturing the
charge, applying it, reconciling failures); for that side — attempt states, SQL to diagnose "I paid
but nothing happened," and the manual refund/reversal playbook — see
`../comprobify/docs/guides/payphone-payments.md` and `../comprobify/docs/adr/028-payphone-card-payments.md`.

::: warning This is how tenants pay *us*
Not a way for tenants to collect money from their own customers, and not exposed outside this app —
Payphone's widget only renders on the domain registered in their developer console, which is why
`createPayphoneSession`/`confirmPayphonePayment` are absent from the API's public docs site and
tenant-facing Postman collection. See CLAUDE.md's "Card payments via Payphone (ADR-028)" entry.
:::

---

## The three things this app does

```
1. Mint a session      createPayphoneSessionAction(paymentId)
                        → POST /v1/payments/:id/payphone-session
                        → ApiPayphoneSession { token, storeId, clientTransactionId, amount breakdown, ... }

2. Render the widget    PayphoneCheckout (src/components/payphone-checkout.tsx)
                        loads Payphone's CDN CSS/JS, calls
                        new PPaymentButtonBox({ ...session }).render('pp-button')

3. Confirm on return    src/app/[locale]/payphone/return/page.tsx
                        confirmPayphonePaymentAction(id, clientTransactionId)
                        → POST /v1/payments/payphone/confirm
                        → { status: APPROVED | CANCELLED | DUPLICATE | ERROR }
```

Once the payer submits card details inside the widget, Payphone takes over — it captures the
charge and redirects the top-level browser to whatever return URL is registered in its console.
Nothing in between is this app's concern; step 3 above is a fresh page load, not a continuation of
step 2's component tree.

---

## Step 1: minting a session

`PendingPaymentCard` (`billing-manager.tsx`) shows a "Transferencia"/"Tarjeta" tab toggle wherever
a payment is awaiting settlement. Selecting "Tarjeta" calls `createPayphoneSessionAction(payment.id)`
— **only on that explicit click, never eagerly on page load**, because minting a session has a real
side effect on the API side: it flips `payments.method` to `PAYPHONE_CARD`. Eagerly minting one just
by rendering the page would misrepresent a payment the tenant never actually chose to pay by card.

`ApiPayphoneSession` (`src/lib/api.ts`) already has amounts broken down exactly the way Payphone's
widget wants them (`amount = amountWithoutTax + amountWithTax + tax + service + tip`, integer
cents) — pass them straight into the widget config, never recompute or round.

**One mint per checkout, not one per widget open.** The API deliberately never reuses an existing
attempt server-side — it can't tell "the payer closed the widget without paying" from "they paid and
the redirect never arrived," and reusing a `clientTransactionId` in the second case would be a
duplicate submission against a charge Payphone may already be holding (`PAYPHONE_TOO_MANY_ATTEMPTS`
below is the API's backstop against a frontend that mints on every open regardless). So this side
holds onto the minted session for as long as it's valid, instead of re-minting on every tab
open/close: `handleSelectCard` reuses `payphoneSession` as-is when the tab is reselected, and only
mints a fresh one when there's no session yet **or** the held one is older than 10 minutes —
Payphone's own widget-form expiry (`PAYPHONE_SESSION_MAX_AGE_MS` in `billing-manager.tsx`; separate
from the 5-minute post-payment auto-reversal window in Step 3). This is driven entirely by a click
handler, never a `useEffect` — deliberately, so React 18 Strict Mode's dev-only double-invoke of
effects can never double a mint. If minting logic is ever moved into an effect, re-check this.

**Selecting "Tarjeta" for the first time still creates a real `payphone_transactions` row, even if
the tenant never submits card details** — there is no way around this, Payphone requires a real
session before it will render anything, so "just looking" necessarily mints one. This isn't a bug:
an abandoned attempt simply sits `PENDING` until the API's reconciliation job marks it `EXPIRED` (see
`../comprobify/docs/guides/payphone-payments.md`'s "Attempt states" table) — the same append-only,
audit-trail design a declined-then-retried card already relies on. The caching above is what keeps
this to *one* row per genuine checkout attempt rather than one per UI interaction.

**Three `createSession` error codes mean "card isn't viable for this payment right now," not "retry
me":**

| Code | Status | Meaning |
|---|---|---|
| `PAYMENT_GATEWAY_NOT_CONFIGURED` | 503 | `PAYPHONE_TOKEN`/`PAYPHONE_STORE_ID` unset for this environment (see "Optional infrastructure" below) |
| `PAYPHONE_AMOUNT_BELOW_MINIMUM` | 400 | Payphone refuses charges under $1.00 — reachable via a small prorated tier-change upgrade |
| `PAYPHONE_TOO_MANY_ATTEMPTS` | 409 | 10+ unresolved attempts already open for this payment — the API's own cap against a runaway minting bug, not a normal state |

For all three, `PendingPaymentCard` shows a toast, switches back to the Transferencia tab, and
**disables** the "Tarjeta" tab (not hides it — the disabled button's `title` still shows why, and
bank transfer is right there as the working alternative). Any *other*, unexpected error code stays
retryable inline (message + a manual "usar transferencia" link) rather than disabling the tab, since
those aren't known-persistent conditions.

---

## Step 2: rendering the widget

`PayphoneCheckout` loads the Cajita de Pagos v2.0 assets from Payphone's CDN:

```
https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css
https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js
```

and, once the script is ready, renders into a fixed `<div id="pp-button">`:

```js
new window.PPaymentButtonBox({
  token, storeId, clientTransactionId, amount, amountWithoutTax,
  amountWithTax, tax, service, tip, currency, reference,
  lang: locale === 'en' ? 'en' : 'es',
}).render('pp-button');
```

**Who actually renders the card-entry fields:** nothing in this app or the API. Once
`PPaymentButtonBox(...).render('pp-button')` runs, Payphone's own script takes over the container
and injects its own UI (card number/expiry/CVV, brand detection, validation) entirely under its
control — this repo and the API only ever supply the numeric/session **config** (token, amounts,
ids), never the form markup itself. There is nothing to customize or debug on our side if a field
looks wrong; that's Payphone's script rendering, not ours.

**`<PayphoneCheckout>` must stay mounted for the lifetime of its session — never conditionally
unmount and remount it, even to hide it.** `.render()` is a one-time call per `clientTransactionId`:
Payphone's own widget SDK tracks which ids it has already processed and **rejects a second
`render()` call for the same one**, failing client-side with "Ya existe una transacción con el
ClientTransactionId especificado." This app hit exactly that: `PendingPaymentCard` used to nest
`<PayphoneCheckout>` inside `{payMethod === 'card' && (...)}`, so switching to the Transferencia tab
and back unmounted-then-remounted it — a fresh mount resets the `renderedRef` guard and calls
`.render()` again for the *same* session, which Payphone refuses. The fix (`billing-manager.tsx`):
hoist `<PayphoneCheckout>` out of that conditional so it mounts exactly once, the first time
`payphoneSession` is set, and toggle a wrapping `<div className={payMethod === 'card' ? '' :
'hidden'}>` around it instead — conditional *visibility*, never conditional *mounting*, once a
session exists. See CLAUDE.md Common Mistake #56.

Still mount it with `key={session.clientTransactionId}` — that's for the case where the session
itself genuinely changes (e.g. a future retry flow that mints a fresh one after a decline), which
*should* force a new instance; it does nothing to protect against the tab-toggle case above, since
the key stays identical across toggles and React only remounts on a key change, not on unmount.

**The rendered form expires 10 minutes after load** (Payphone's own limit, separate from the
5-minute post-payment auto-reversal window described in Step 3). If a tenant leaves the widget open
past that, mint a fresh session rather than trying to reuse the expired one — there's no code for
this today since the widget itself surfaces the expiry to the payer, but keep it in mind if this
guide's flow is ever extended with client-side session refresh.

No `responseUrl` is passed to the widget — see Step 3 for why.

---

## Step 3: the return page, and why it can't wait

Once the payer completes (or cancels) the widget, Payphone redirects the **top-level browser** —
not an iframe — to a fixed URL:

```
<return URL>?id=<payphoneTransactionId>&clientTransactionId=<yours>
```

That URL is not part of the session config; it is registered once, per Payphone *store*, in their
developer console. `src/app/[locale]/payphone/return/page.tsx` handles it: a Server Component that
calls `confirmPayphonePaymentAction(id, clientTransactionId)` **unconditionally at the top of its
render** — never behind a button, never deferred to a client `useEffect`.

This is deliberate and non-negotiable: **Payphone auto-reverses any charge not confirmed within 5
minutes of payment.** A page that waits on client-side JavaScript to hydrate before firing the
confirm call is racing that window for no reason. It's also why this route is *not* built like
`/verify-email` (Common Mistake #47 in `CLAUDE.md`) — that page deliberately splits a safe,
read-only check from a click-triggered consume, because it's reachable via an emailed link an
automated scanner might prefetch. This route is only ever reached via a real Payphone redirect
after actual card entry, so there's no prefetch risk to guard against, and the vendor's constraint
points the opposite direction: fire immediately, don't wait for a click.

The call is also safe to repeat — reloading the return page (or Payphone somehow redirecting twice)
returns the stored outcome without contacting Payphone again, so there's no double-charge risk from
a refresh.

**`confirmPayphonePaymentAction` cannot call `revalidatePath`.** It's tempting to revalidate
`/settings/billing` here so it isn't served stale from the Router Cache right after a payment that
just changed the tenant's tier — the standard pattern for a mutation elsewhere in this app. But
`revalidatePath` is only legal from a Server Action triggered by a real client event (a form
submission, a button's `onClick`) or a Route Handler; calling it from a Server Action that's itself
awaited directly inside a Server Component's render — which is exactly what this page does, by
design — throws `Error: Route ... used "revalidatePath ..." during render which is unsupported`.
The fix isn't a different revalidation call, it's not needing one: the return page's own links back
to `/settings/billing` (`BillingLink`) are a plain `<a>`, not the i18n `<Link>` — a full browser
navigation always bypasses the Router Cache regardless of whether anything revalidated it. See
CLAUDE.md Common Mistake #57.

### Outcomes

| `result.status` | Meaning | Page shows |
|---|---|---|
| `APPROVED` | Captured and applied — the plan is already active. | Success card → "Ir a Facturación" |
| `CANCELLED` | Declined or cancelled. Nothing charged. | Neutral card → try again from Billing |
| `DUPLICATE` | This payment was already paid by another attempt (e.g. two tabs). Real money, needs a manual refund. | Amber card → "Contactar a soporte" |
| `ERROR` | Confirmed amount didn't match the session. Nothing applied. | Destructive card → "Contactar a soporte" |

Plus one thrown-error case that isn't a `status` value at all:

| `ApiError.code` | Meaning | Page shows |
|---|---|---|
| `PAYPHONE_CONFIRM_FAILED` (502) | Transport failure reaching Payphone. The charge is **unresolved, not declined** — a backend job reconciles it within ~5 minutes. | Amber card, explicitly says not to retry |

Any other thrown `ApiError` (e.g. `ACCOUNT_SUSPENDED`) falls back to the generic `apiError`
namespace lookup, same as everywhere else in the app.

**Never turn `PAYPHONE_CONFIRM_FAILED` into a retry prompt.** The charge may already be captured;
confirming again with a *fresh* session would risk a second real charge. The correct move is to do
nothing and let the API's own reconciliation job settle it.

---

## Environment setup: registering the return URL

Payphone's developer console (appdeveloper.payphonetodoesposible.com) registers a **web
application**, each with its own independent `Web Domain` and `Response URL` fields, its own
credentials (Token/StoreID, on that application's "Credenciales" tab — these are what become
`PAYPHONE_TOKEN`/`PAYPHONE_STORE_ID` in `comprobify`'s env), and its own environment mode (test vs.
production, set inside that application's own config). There is no per-session `responseUrl` in the
widget config to override any of this.

**Give each environment its own application — don't share one across environments by toggling its
fields.** The Response URL is a single value per application: pointing an existing application's
Response URL at `localhost` to test locally would silently break every other environment sharing
that application until you toggle it back. `comprobify`'s own setup notes this explicitly (`.example.env`:
"Staging should point at Payphone's TEST store, never the live one" — and the same reasoning extends
to local dev needing a third application, separate from staging's).

Because URL paths in this app stay English regardless of locale content (see CLAUDE.md), and
`localePrefix: 'always'` means every route is locale-prefixed, only the **Spanish** path is ever
actually reachable at a fixed URL — register that one, not a bare or English-prefixed variant:

| Environment | Application mode | Web Domain | Response URL |
|---|---|---|---|
| Local dev | test | `http://localhost:3000` | `http://localhost:3000/es/payphone/return` |
| Staging | test | `https://app-staging.comprobify.com` | `https://app-staging.comprobify.com/es/payphone/return` |
| Production | production | `https://app.comprobify.com` | `https://app.comprobify.com/es/payphone/return` |

`Web Domain` and `Response URL` are independent: the domain controls where the widget will
**render**, the Response URL controls only where the post-payment redirect **goes**. That means you
can validate that the widget accepts its token and that Payphone accepts the amount mapping — both
checked at submit, before any redirect — by temporarily adding `localhost` as an extra Web Domain on
an existing test application, without a dedicated one. But the redirect still lands wherever that
application's single Response URL points, so a full local loop through the return page needs its own
application, not a borrowed one.

Payphone's own docs only confirm that `http://localhost` (no SSL certificate) is allowed for local
testing — they don't spell out whether the domain match is port-sensitive. Register with the port
included first (matching the actual browser origin, `http://localhost:3000`); if the widget rejects
it as an unauthorized domain, try registering the bare `http://localhost` instead.

If a registration is missing or wrong, `POST /v1/payments/:id/payphone-session` still succeeds — the
mismatch only surfaces when the widget tries to render on an unregistered domain (it will fail to
load or reject the transaction), or when Payphone has nowhere sensible to redirect back to. This repo
never holds Payphone credentials of its own; the token in the widget config is minted
per-session and only ever reaches the browser through an authenticated `payphone-session` response.

---

## Optional infrastructure

With `PAYPHONE_TOKEN` unset on the API, `POST /v1/payments/:id/payphone-session` returns
`503 PAYMENT_GATEWAY_NOT_CONFIGURED` and the entire SPI bank-transfer flow is unaffected — a cold
local environment or a misconfigured deploy can never take billing down with it. This app treats
that 503 as a normal, expected outcome (fall back to the transfer tab), not an error to surface
loudly.

---

## Troubleshooting (frontend side)

**"Tarjeta" tab is disabled, or a toast appeared and it switched back to Transferencia.** One of the
three `CARD_UNAVAILABLE_CODES` fired (see Step 1) — check the surfaced `apiError` code (also in the
disabled tab's `title` tooltip):
- `PAYMENT_GATEWAY_NOT_CONFIGURED` — Payphone credentials unset on the API for this environment; expected outside production/staging with a real store configured.
- `PAYPHONE_AMOUNT_BELOW_MINIMUM` — Payphone rejects any charge under $1.00 outright (undocumented on their side, found by probing their `Prepare` endpoint). Reachable in practice via a small prorated tier-change upgrade.
- `PAYPHONE_TOO_MANY_ATTEMPTS` — 10+ unresolved attempts already exist for this payment (`comprobify`'s own `MAX_PENDING_ATTEMPTS_PER_PAYMENT`). Legitimately reachable only if something is minting in a loop (a regression in the caching described in Step 1) — if you see this in normal use, that's the bug to chase, not this error itself.

**"Tarjeta" tab shows an inline error but stays enabled.** Any *other* `createSession`/confirm error
code — e.g. `PAYMENT_ALREADY_VERIFIED` (the payment already settled through another attempt; refresh
the billing page) or `PAYPHONE_SESSION_NOT_FOUND` (only from the confirm call, not session creation —
see below). These aren't known-persistent conditions, so the tab stays clickable to retry.

**Widget button never appears / renders blank.** Almost always a domain mismatch — the current host
isn't registered for the store whose token the session returned (see the table above), or the CDN
script failed to load (check the browser console/network tab for `cdn.payphonetodoesposible.com`
requests). This app sets no CSP, so a blocked request here means a network issue or an ad-blocker,
not an app-side header.

**Payer completes the widget but nothing happens / lands on a blank or 404 page.** The registered
return URL for that store doesn't match `/{locale}/payphone/return` on the current domain — re-check
the console registration, and remember it's locale-specific (`/es/...`), not the bare path.

**Return page shows "Enlace inválido" (missing params).** Someone navigated to
`/payphone/return` directly without `?id=` and `?clientTransactionId=` — not a real payment flow
issue, just a guarded edge case for a bookmarked or mistyped URL.

**For everything downstream of a successful confirm() call** (duplicate charges, captured-but-
unapplied money, reconciliation-job health, manual refunds) — that's all on the API side. Start with
`../comprobify/docs/guides/payphone-payments.md`, which has the SQL queries and the decision table
for "I paid but nothing happened."

---

## Key files

| File | Role |
|---|---|
| `src/lib/api.ts` | `createPayphoneSession()`, `confirmPayphonePayment()`, `ApiPayphoneSession`/`ApiPayphoneConfirmResult` types |
| `src/app/actions/billing.ts` | `createPayphoneSessionAction`, `confirmPayphonePaymentAction` — both gated `billing.manage` |
| `src/components/payphone-checkout.tsx` | Loads the Cajita CDN assets, renders `PPaymentButtonBox` |
| `src/components/billing-manager.tsx` | `PendingPaymentCard`'s "Transferencia"/"Tarjeta" tab toggle, session caching/expiry (`PAYPHONE_SESSION_MAX_AGE_MS`), and the disabled-tab handling for `CARD_UNAVAILABLE_CODES` |
| `src/app/[locale]/payphone/return/page.tsx` | Confirms the charge on load, renders the outcome |
| `messages/es.json` / `en.json` | `billing.payphone.*` (widget UI) and `billing.payphone.return.*` (return page) namespaces |
