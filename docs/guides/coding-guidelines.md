# Coding Guidelines

Patterns and examples for building features in `comprobify-web`.

---

## Adding a new screen

### 1. Create the page file

```
src/app/[locale]/your-screen/page.tsx
```

```tsx
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

export default async function YourScreenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);      // Required for static rendering
  const t = await getTranslations('yourNamespace');

  // Fetch data server-side
  const data = await getSomeData();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {/* ... */}
    </div>
  );
}
```

### 2. Add navigation link (if needed)

In `src/components/nav.tsx`, add to the `navItems` array:
```ts
{ href: '/your-screen', icon: SomeIcon, labelKey: 'yourScreen' as const }
```

Add the label to `messages/es.json` and `messages/en.json`:
```json
"nav": {
  "yourScreen": "Tu pantalla"
}
```

### 3. Add translations

Add a namespace to both message files. Always update both files together.

### 4. Add a loading skeleton (if needed)

Not every screen needs `loading.tsx` — only add one where the page's Server Component does a real data fetch with perceptible latency (an external Comprobify API call, not a fast local DB read) and the page has a stable enough layout that a matching skeleton is worth maintaining. Skip it for pages that render near-instantly or whose layout changes often.

When it's warranted:
```
src/app/[locale]/your-screen/loading.tsx
```

`loading.tsx` is a Suspense boundary Next.js shows automatically (on both client navigation and SSR streaming) while the page awaits its data — it needs no props, no translations, and no `'use client'`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function YourScreenLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-40" />
      {/* mirror the real page's layout, not a generic spinner */}
    </div>
  );
}
```

Shape the skeleton after the actual page (card grid, table rows, etc.) so there's no layout shift when real content replaces it — see `src/app/[locale]/dashboard/loading.tsx` and `src/app/[locale]/invoices/[key]/loading.tsx` for examples. If the page's layout changes later, update its skeleton to match.

### 5. Pick the right content width

`<main>` (`src/app/[locale]/layout.tsx`) has no width cap of its own — a page's root `<div>` fills the whole available width (viewport minus the sidebar) unless it opts into a cap. Which one to use depends on content type, not on the page's importance:

- **List/table pages** (records, catalogs, dashboards — anything with a `<Table>` or a card grid of records) stay fluid: no `max-w-*` on the root div. More width means more visible columns/rows, so it should use whatever space `<main>` gives it. Examples: `/dashboard`, `/documents/[type]`, `/users`, `/clients`, `/catalog`, `/issuers`, `/invoices/new`, `/invoices/[key]`, `/settings/api-keys`, every `/admin/*` list.
- **Settings/config forms** (a single-column form with no tabular content) cap width and center it: `<div className="mx-auto max-w-3xl">`. A wide single-column form is harder to scan, not easier — capping keeps line lengths readable even on an ultra-wide monitor. Every page in this cluster uses the *same* cap (`max-w-3xl`) so navigating between them doesn't feel like the app randomly resized — don't reach for `max-w-lg`/`2xl`/`4xl`/etc. for a new settings-style page; use `max-w-3xl` unless there's a specific reason to deviate. Examples: `/settings`, `/settings/account`, `/settings/billing`, `/settings/notifications`, `/settings/webhooks`, `/issuers/[id]`, `/support` (in-app chrome).

When a new page is genuinely a hybrid (e.g. a form that also renders a wide table), prefer the fluid pattern — that's what `/invoices/new` and `/invoices/[key]` already do.

---

## Adding a Server Action (mutation)

Server Actions handle form submissions and button actions (send, rebuild, etc.).

```
src/app/[locale]/your-screen/actions.ts
```

```ts
'use server';

import { redirect } from '@/i18n/navigation';
import { revalidatePath } from 'next/cache';
import { sendToSri } from '@/lib/api';
import { ApiError } from '@/lib/errors';

export async function sendToSriAction(accessKey: string) {
  try {
    const document = await sendToSri(accessKey);
    // On success: redirect or return data
    redirect(`/invoices/${document.accessKey}`);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.code };
    }
    throw err; // Let Next.js error boundary handle unexpected errors
  }
}
```

If the action changes data that the **shared layout** displays (e.g. tenant name, environment, issuer list), call `revalidatePath('/', 'layout')` before redirecting. Without it, Next.js reuses the cached layout RSC payload and the Nav appears stale until a manual reload:

```ts
revalidatePath('/', 'layout');
redirect({ href: '/dashboard', locale });
```

**Re-throwing unknown errors (`throw err` above) is what makes Sentry capture them automatically** via `onRequestError` — Next.js only reports errors that propagate unhandled out of the action. If you have a good reason to catch and swallow a non-`ApiError` exception instead (e.g. to show a friendly message rather than a crash page after an external side effect already succeeded — see `linkExistingTenantAction` in `src/app/actions/onboarding.ts`), you are opting out of that automatic reporting. Call `Sentry.captureException(err)` explicitly before returning the generic error code, or the failure becomes invisible:

```ts
} catch (err) {
  Sentry.captureException(err);
  return { error: 'DB_WRITE_FAILED' };
}
```

If you use a broad `try/catch` around the entire action body, you must re-throw `NEXT_REDIRECT` errors or the redirect will be swallowed:

```ts
} catch (err) {
  if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
  // handle other errors
}
```

Call it from a Client Component:
```tsx
'use client';

import { sendToSriAction } from './actions';

function SendButton({ accessKey }: { accessKey: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() => startTransition(() => sendToSriAction(accessKey))}
    >
      {isPending ? t('actions.sending') : t('actions.send')}
    </Button>
  );
}
```

---

## Fetching catalog data for form selects

SRI lookup tables (ID types, payment methods, tax rates) should be fetched server-side and passed as props to the Client Component form. Never hardcode catalog options in the frontend.

**Pattern:**

```tsx
// page.tsx (Server Component)
import { requireContext } from '@/lib/context';
import { listCatalogIdTypes, listCatalogPaymentMethods } from '@/lib/api';

export interface MyCatalogs {
  idTypes: CatalogIdType[];
  paymentMethods: CatalogPaymentMethod[];
}

export default async function MyPage(...) {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  const [idTypes, paymentMethods] = await Promise.all([
    listCatalogIdTypes(apiCtx),
    listCatalogPaymentMethods(apiCtx),
  ]);
  return <MyForm catalogs={{ idTypes, paymentMethods }} />;
}
```

```tsx
// MyForm.tsx (Client Component)
import type { MyCatalogs } from './page';

export function MyForm({ catalogs }: { catalogs: MyCatalogs }) {
  // Use catalogs.idTypes to render SelectItem options
}
```

**Showing the label in the trigger:** Base UI's `Select.Value` renders the raw `value` by default, not the item's text. Pass a render function:

```tsx
<SelectValue>
  {(v: string | null) => catalogs.idTypes.find((t) => t.code === v)?.description ?? v}
</SelectValue>
```

**Dropdown width:** Add `className="w-auto min-w-(--anchor-width)"` to `SelectContent` so it can grow wider than the trigger to accommodate long option text.

---

## Adding a Client Component

Only use Client Components when you need interactivity (hooks, event handlers).

```tsx
'use client';  // Required at the top

import { useTranslations } from 'next-intl';  // NOT getTranslations

export function SomeInteractiveComponent() {
  const t = useTranslations('yourNamespace');
  // ... useState, useEffect, event handlers
}
```

**Rule:** Extract only the interactive part into a Client Component. Keep the parent page as a Server Component to preserve data fetching on the server.

---

## Adding a new API endpoint call

**Every field in an `api.ts` interface must be verified against the actual API source before shipping.** The types are hand-maintained — there is no code generation. Past bugs were caused entirely by interfaces written against assumed response shapes that didn't match reality.

### Step 1 — Confirm the route exists

Open `../comprobify/src/routes/` and find the relevant routes file. Confirm:
- The HTTP method and path are correct.
- The route doesn't require `X-Issuer-Id` (via `resolveIssuer` middleware) unless you plan to pass `issuerId` in the context.

Routes that use `router.use(asyncHandler(resolveIssuer))` require an issuer context; routes that only use `authenticate` do not. Document endpoints require issuer context; issuer-management and tenant endpoints do not.

### Step 2 — Read the exact response shape

Open the controller (`../comprobify/src/controllers/`) and find the `res.json(...)` call for your endpoint. Then follow every referenced service/presenter function and read what it actually returns — field by field. Do not guess or infer from the function name.

**Example — do this every time:**

```
// In ../comprobify/src/controllers/api-key.controller.js
const create = async (req, res) => {
  const apiKey = await apiKeyService.createKey(...);
  res.status(201).json({ ok: true, apiKey });  // ← response key is 'apiKey', plain string
};
```

```
// In ../comprobify/src/services/api-key.service.js → createKey()
return plainToken;  // ← returns a string, NOT an object
```

The TypeScript interface that matches this is:
```ts
{ ok: true; apiKey: string }   // ✓ correct
{ ok: true; key: CreatedApiKey } // ✗ wrong — result.key would be undefined
```

### Step 3 — Every API id is a UUID string, and never a number

The Comprobify API is UUID-keyed throughout. Every table is declared
`id UUID PRIMARY KEY DEFAULT uuid_generate_v7()` — see its
`db/migrations/001_create_issuers.sql`, `023_create_api_keys.sql`,
`035_tenants.sql`, `044_notifications.sql`, `052_subscriptions_and_payments.sql` —
and its own routes validate ids with `param('id').isUUID()`.

```ts
// API sends:  {"id": "0199a3f2-7c41-7e3a-9f2b-6d1c4e8a05b7"}
```

Consequences:
- **Type every API id and id parameter as `string`.**
- **Never call `Number()` on an API id.** `Number("0199a3f2-…")` is `NaN`. Prisma
  rejects `NaN` on write, and the failure surfaces to the user as an opaque
  "internal error" with no indication of the cause.

> This section previously described a "bigint-as-string trap" and instructed
> applying `Number(record.id)` at every Prisma write site. That was never true of
> this API, and following it broke tenant onboarding outright
> (`Number(result.tenant.id)` → `NaN` → `DB_WRITE_FAILED`) along with every admin
> payment and tenant action. If you find any `Number()` around an id, it is a bug.

**Local ids and API ids are both UUID strings — the compiler cannot tell them apart.**
That makes this the one ID rule you have to enforce by reading rather than by
`tsc`. The four columns that mirror an API id are `Tenant.apiTenantId`,
`TenantApiKey.apiKeyId`, `Issuer.apiIssuerId` and `Notification.issuerId`; every
other id column is local. Matching one against the other is a bug that has
shipped before — see CLAUDE.md Common Mistake #20 and ADR-007.

| | Example | Used in |
|---|---|---|
| Local id | `Issuer.id`, `User.id` | `db.*` where-clauses |
| API id | `Issuer.apiIssuerId`, `ApiCtx.issuerId` | `src/lib/api.ts`, `admin-api.ts` |

### Step 4 — Check what fields are actually present

Some fields you might expect are simply not returned. Verify each interface field has a corresponding line in the service's format/return statement. Common surprises:

| Assumed field | Reality |
|---|---|
| `id` on create responses | Often omitted — call `GET` after `POST` to get it |
| `environment` on issuer list | Not returned by `listIssuers` |
| `lastFour` on key list | Not returned by `formatKey` |
| `isActive` | API field is `active` (no `is` prefix) |

### Step 5 — Write the function

```ts
// src/lib/api.ts

// Verified against: ../comprobify/src/controllers/example.controller.js → create()
// Response shape:   { ok: true; item: { id: string; name: string } }
export interface ExampleItem {
  id: string;    // uuid
  name: string;
}

export async function createExample(ctx: ApiCtx, name: string): Promise<ExampleItem> {
  const result = await request<{ ok: true; item: ExampleItem }>(
    '/api/examples',
    ctx,
    { method: 'POST', body: JSON.stringify({ name }) },
  );
  return result.item;
}
```

Store the id verbatim — the local mirror column is `@db.Uuid`, so there is
nothing to convert:
```ts
await db.example.create({
  data: {
    apiExampleId: apiExample.id, // UUID string, stored as-is — never Number()
    ...
  },
});
```

### Step 6 — When the POST response is incomplete

Some `POST` endpoints return only a token or minimal data (no id, no full object). If you need the id for future operations (e.g., revocation), make a follow-up `GET` call after creation:

```ts
export async function createKey(ctx: ApiCtx, label: string): Promise<FullKey> {
  // POST returns only the plain token
  const { apiKey: plainToken } = await request<{ ok: true; apiKey: string }>(
    '/api/keys', ctx, { method: 'POST', body: JSON.stringify({ label }) },
  );
  // GET with the new token to retrieve its id/metadata
  const { keys } = await request<{ ok: true; keys: ApiKeyInfo[] }>(
    '/api/keys', { apiKey: plainToken },
  );
  const record = keys[0]; // newest first
  return { id: Number(record.id), label: record.label ?? label, key: plainToken };
}
```

### Quick verification checklist

Before merging any new `api.ts` function:

- [ ] Route confirmed in `../comprobify/src/routes/`
- [ ] Response shape read from the controller's `res.json()` call
- [ ] Every interface field traced to the service/presenter return value
- [ ] `id` fields typed as `string` (uuid), with no `Number()` anywhere
- [ ] `Number(record.id)` used at every Prisma `Int` write site
- [ ] Field names match exactly (e.g., `active` not `isActive`, `apiKey` not `key`)
- [ ] If POST omits id: follow-up GET implemented

---

## Localization rules

1. **All visible strings go in message files.** No hardcoded text in components.

2. **Add to both files at once.** `es.json` is the source of truth; `en.json` mirrors it.

3. **Map API error codes** using the `apiError` namespace:
   ```tsx
   if (result?.error) {
     return <p>{t(`apiError.${result.error}`)}</p>;
   }
   ```

4. **Format amounts** with `es-EC` locale:
   ```ts
   const formatted = new Intl.NumberFormat('es-EC', {
     style: 'currency',
     currency: 'USD',
   }).format(Number(document.total));
   ```

5. **Use the API's date format** (DD/MM/YYYY) directly in most cases — it's already formatted for display. Convert to `Date` only when you need to do date arithmetic.

---

## Mobile responsiveness

All UI changes must work on mobile. Follow these patterns:

**Layout stacking** — default to column, expand at `sm:` or `md:`:
```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
```

**Grids** — single column on mobile, multi-column on larger screens:
```tsx
<div className="grid gap-4 sm:grid-cols-2">        // 1 → 2 cols
<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">  // 1 → 2 → 4 cols
```

**Tables** — always wrap in a scroll container:
```tsx
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

**Long text / codes** — prevent overflow with `break-all` or `truncate`:
```tsx
<span className="break-all font-mono">{longCode}</span>
```

**Page padding** — use less padding on mobile:
```tsx
<main className="p-4 md:p-8">
```

---

## Dropdowns inside overflow containers

`overflow-x-auto` (or any `overflow` other than `visible`) clips absolutely-positioned children. Use `createPortal` with `position: fixed` when rendering a dropdown inside such a container:

```tsx
import { createPortal } from 'react-dom';

function MyDropdown({ inputRef, open, children }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePos = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left });
    }
  };

  return (
    <>
      <Input ref={inputRef} onFocus={updatePos} onChange={updatePos} />
      {open && pos && createPortal(
        <div className="fixed z-50 ..." style={{ top: pos.top, left: pos.left }}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
```

Use `onMouseDown` (not `onClick`) on dropdown options so the selection fires before the input's `onBlur` closes the dropdown.

---

## Adding a new shadcn component

```bash
npx shadcn@latest add <component-name>
```

This copies files into `src/components/ui/`. Do not edit them. Build your UI using these components as building blocks, wrapped in custom components in `src/components/`.

---

## Documentation checklist

When adding a new screen, action, or API call, also update:
- [ ] `messages/es.json` and `messages/en.json`
- [ ] `CHANGELOG.md` — add to Unreleased > Added
- [ ] `NEXT_STEPS.md` — remove the item if it was tracked there
- [ ] `docs/site/screens/` — update or create the screen spec

See `docs/guides/documentation-checklist.md` for the full checklist by change type.
