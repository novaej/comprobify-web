import { toast } from 'sonner';

type TFunc = { (key: string): string; has(key: string): boolean };

/**
 * Shows a `toast.error` for an API error code returned by a Server Action.
 *
 * Looks up the code in the `apiError` i18n namespace. Falls back to
 * `apiError.UNKNOWN` for any code that isn't mapped yet, so new API codes
 * degrade gracefully before their translations land.
 *
 * Usage in a Client Component:
 *   const tError = useTranslations('apiError');
 *   // ...
 *   if (result?.error) toastApiError(result.error, tError);
 */
export function toastApiError(code: string, t: TFunc): void {
  const key = t.has(code) ? code : 'UNKNOWN';
  toast.error(t(key));
}
