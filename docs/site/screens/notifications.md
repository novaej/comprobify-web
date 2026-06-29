# Notification Preferences Screen

**Route:** `/es/settings/notifications`  
**Component:** `src/app/[locale]/settings/notifications/page.tsx`  
**Type:** Server Component + Client Component (`NotificationPreferences`)  
**Permission:** `notifications.manage` (Owner + Admin)

---

## Purpose

Lets owners and admins control which event types trigger notifications for the entire tenant. Changes are saved immediately to the Comprobify API (`PUT /api/notification-preferences`) on each toggle.

---

## Sections

### Live types

Toggles for currently-active notification event types:

| Type | Event |
|---|---|
| `DOCUMENT_AUTHORIZED` | SRI authorization confirmed |
| `CERT_EXPIRING` | Certificate expires within 30 days |
| `CERT_EXPIRED` | Certificate has expired |
| `PAYMENT_VERIFIED` | Provider verified an uploaded payment proof (initial, tier-change, or renewal) |
| `PAYMENT_REJECTED` | Provider rejected an uploaded payment proof |
| `SUBSCRIPTION_RENEWAL_DUE` | ~7 days before the current billing period ends — a renewal payment is already open |
| `SUBSCRIPTION_EXPIRED` | Subscription ran past its renewal grace period unpaid — tenant auto-downgraded to FREE |

Each toggle is **optimistic** — it flips immediately in the UI and the API call fires in the background. If the server returns an error the toggle reverts and a toast is shown.

Clicking any of the four payment/subscription types (in the bell's `NotificationPanel`, not this preferences screen) navigates to `/settings/billing` via `getNotificationHref()` (`src/lib/notification-link.ts`) — none of their metadata has a more specific page to deep-link to.

### Coming soon

Non-interactive list of reserved types planned for future activation:

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
   │  • getPreferencesAction() → GET /api/notification-preferences
   │  • Renders <NotificationPreferences preferences={...} />
   │
2. User clicks a toggle
   │  • Optimistic UI flip (immediate)
   │  • updatePreferencesAction({ type, enabled }) → PUT /api/notification-preferences
   │
3a. Success → state committed (no revert)
3b. Error → toast shown, toggle reverts to previous value
```

---

## Key files

| File | Role |
|---|---|
| `src/app/[locale]/settings/notifications/page.tsx` | Server Component — fetches preferences, requires `notifications.manage` |
| `src/components/notification-preferences.tsx` | Client Component — optimistic toggles, spinner overlay |
| `src/app/actions/notifications.ts` | `getPreferencesAction`, `updatePreferencesAction` |
| `src/lib/api.ts` | `getNotificationPreferences`, `updateNotificationPreferences` |
| `src/lib/notification-link.ts` | `getNotificationHref()` — maps a notification `type` to where clicking it navigates |
| `messages/es.json` → `notificationPreferences` | Section labels, type descriptions, coming-soon label |
