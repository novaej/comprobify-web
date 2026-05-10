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

If the action changes data that the **shared layout** reads from the session (e.g. `hasIssuer`, `environment`), call `revalidatePath('/', 'layout')` before redirecting. Without it, Next.js reuses the cached layout RSC payload and the Nav appears stale until a manual reload:

```ts
revalidatePath('/', 'layout');
redirect({ href: '/dashboard', locale });
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

1. Add the function to `src/lib/api.ts`:

```ts
export async function newApiCall(param: string): Promise<SomeType> {
  const result = await request<{ ok: true; data: SomeType }>(
    `/api/some-endpoint/${param}`
  );
  return result.data;
}
```

2. Add the TypeScript type for the response if needed.

3. Call it only from Server Components, Server Actions, or Route Handlers — never from Client Components.

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
