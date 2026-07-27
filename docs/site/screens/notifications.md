# Notification Preferences Screen

**Route:** `/es/settings/notifications`  
**Component:** `src/app/[locale]/settings/notifications/page.tsx`  
**Type:** Server Component + Client Component (`NotificationPreferences`)  
**Permission:** `notifications.manage` (Owner + Admin)

---

## Purpose

Lets owners and admins control, per **(type, channel)** pair, which notifications the system creates or emails for the entire tenant. Changes are saved immediately to the Comprobify API (`GET`/`PATCH /v1/notifications/preferences`) on each toggle.

`channel` is `IN_APP` (whether it appears in `GET /v1/notifications`/the bell) or `EMAIL` (whether the equivalent email is sent). A type only gets a toggle for a channel it actually supports — `TYPE_CHANNELS` in `notification-preferences.tsx` mirrors comprobify's `src/constants/notification-catalog.js`.

---

## Sections

### Always on

A single locked, non-interactive row for `PRICE_CHANGE_ANNOUNCED` — the 30-day price-change legal notice (ADR-023/ADR-024 on the API side). It's **mandatory**: never returned by `GET`, rejected by `PATCH`, and always sent on every channel it supports. Shown here purely for transparency, not as a control.

### Active types

Toggles for currently-active notification event types. Types with an email counterpart get **two** toggles (In-app / Email); the rest get one:

| Type | Channels | Event |
|---|---|---|
| `DOCUMENT_AUTHORIZED` | In-app | SRI authorization confirmed |
| `CERT_EXPIRING` | In-app | Certificate expires within 30 days |
| `CERT_EXPIRED` | In-app | Certificate has expired |
| `PAYMENT_VERIFIED` | In-app + Email | Provider verified an uploaded payment proof (initial, tier-change, or renewal) |
| `PAYMENT_REJECTED` | In-app + Email | Provider rejected an uploaded payment proof |
| `SUBSCRIPTION_RENEWAL_DUE` | In-app + Email | ~7 days before the current billing period ends — a renewal payment is already open |
| `SUBSCRIPTION_EXPIRED` | In-app + Email | Subscription ran past its renewal grace period unpaid — tenant auto-downgraded to FREE |

Each toggle is **optimistic** — it flips immediately in the UI and the API call fires in the background per (type, channel). If the server returns an error the toggle reverts and a toast is shown.

Clicking any of the payment/subscription/price-change types (in the bell's `NotificationPanel`, not this preferences screen) navigates to `/settings/billing` via `getNotificationHref()` (`src/lib/notification-link.ts`) — none of their metadata has a more specific page to deep-link to.

### Coming soon

Non-interactive list of reserved types planned for future activation (currently In-app only):

| Type | Description |
|---|---|
| `SRI_SUBMISSION_FAILED` | SRI submission retry exhausted |
| `EMAIL_DELIVERY_FAILED` | Customer email could not be delivered |
| `QUOTA_WARNING` | Approaching invoice quota limit |

---

## Data flow

```
1. settings/notifications/page.tsx (Server Component)
   │  • requirePermission('notifications.manage')
   │  • getPreferencesAction() → GET /v1/notifications/preferences
   │  • Renders <NotificationPreferences initialPreferences={...} />
   │    (one row per subscribable (type, channel) pair)
   │
2. User clicks a channel toggle
   │  • Optimistic UI flip (immediate)
   │  • updatePreferencesAction([{ type, channel, enabled }]) → PATCH /v1/notifications/preferences
   │
3a. Success → state committed (no revert)
3b. Error → toast shown, toggle reverts to previous value
```

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/notifications/page.tsx` | Server Component — fetches preferences, requires `notifications.manage` |
| `src/components/notification-preferences.tsx` | Client Component — per-channel optimistic toggles, locked mandatory-type row, spinner overlay |
| `src/app/actions/notifications.ts` | `getPreferencesAction`, `updatePreferencesAction` |
| `src/lib/api.ts` | `NotificationPreference` (`{type, channel, enabled}`), `getNotificationPreferences`, `updateNotificationPreferences` |
| `src/lib/notification-link.ts` | `getNotificationHref()` — maps a notification `type` (including `PRICE_CHANGE_ANNOUNCED`) to where clicking it navigates |
| `messages/es.json` → `notificationPreferences` | Section labels, channel labels, type descriptions, mandatory-type note |
