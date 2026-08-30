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

A `503 PAYMENT_GATEWAY_NOT_CONFIGURED` means `PAYPHONE_TOKEN`/`PAYPHONE_STORE_ID` are unset on the
API for this environment (see "Optional infrastructure" below) — this is a normal, expected state,
not a bug. `PendingPaymentCard` shows an inline fallback message and a button back to the transfer
tab; bank transfer keeps working regardless.

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

**Mount `<PayphoneCheckout>` with `key={session.clientTransactionId}`.** The widget attaches once
per instance — reusing the same component instance for a new session (e.g. after switching tabs
away and back) silently no-ops instead of rendering a fresh form. A `key` forces React to mount a
genuinely new instance whenever the session changes.

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

Payphone's developer console registers a **web application per domain** — each entry has a
"Dominio Web" (domain) field and a "URL de Respuesta" (return URL) field, and there is no
per-session `responseUrl` in the widget config to override either one. `comprobify` uses **two
separate Payphone stores**: a TEST store for non-production environments and the LIVE store for
production (`.example.env`: "Staging should point at Payphone's TEST store, never the live one").

Because URL paths in this app stay English regardless of locale content (see CLAUDE.md), and
`localePrefix: 'always'` means every route is locale-prefixed, only the **Spanish** path is ever
actually reachable at a fixed URL — register that one, not a bare or English-prefixed variant:

| Environment | Payphone store | Dominio Web | URL de Respuesta |
|---|---|---|---|
| Local dev | TEST | `http://localhost:3000` | `http://localhost:3000/es/payphone/return` |
| Staging | TEST | `https://app-staging.comprobify.com` | `https://app-staging.comprobify.com/es/payphone/return` |
| Production | LIVE | `https://app.comprobify.com` | `https://app.comprobify.com/es/payphone/return` |

Payphone's own docs only confirm that `http://localhost` (no SSL certificate) is allowed for local
testing — they don't spell out whether the domain match is port-sensitive. Register with the port
included first (matching the actual browser origin, `http://localhost:3000`); if the widget rejects
it as an unauthorized domain, try registering the bare `http://localhost` instead.

If a registration is missing or wrong, `POST /v1/payments/:id/payphone-session` still succeeds — the
mismatch only surfaces when the widget tries to render on an unregistered domain (it will fail to
load or reject the transaction), or when Payphone has nowhere sensible to redirect back to.
`PAYPHONE_TOKEN`/`PAYPHONE_STORE_ID` are API-side env vars (`comprobify`'s `.env`, not this app's) —
this repo never holds Payphone credentials of its own; the token in the widget config is minted
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

**"Tarjeta" tab shows an error immediately.** Check the surfaced `apiError` code:
- `PAYMENT_GATEWAY_NOT_CONFIGURED` — Payphone credentials unset on the API for this environment; expected outside production/staging with a real store configured.
- `PAYMENT_ALREADY_VERIFIED` — the payment already settled through another attempt; refresh the billing page.
- `PAYPHONE_SESSION_NOT_FOUND` (only from the confirm call, not session creation) — see below.

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
| `src/components/billing-manager.tsx` | `PendingPaymentCard`'s "Transferencia"/"Tarjeta" tab toggle |
| `src/app/[locale]/payphone/return/page.tsx` | Confirms the charge on load, renders the outcome |
| `messages/es.json` / `en.json` | `billing.payphone.*` (widget UI) and `billing.payphone.return.*` (return page) namespaces |
