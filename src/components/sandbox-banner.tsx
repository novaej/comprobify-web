import { getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';

// Server component — reads the COMPROBIFY_SANDBOX env var to decide
// whether to render the banner. This env var is controlled by the operator
// and mirrors the issuer.sandbox field on the Comprobify API side.
// Phase 2: replace with an API call to GET /api/issuer/me when that endpoint exists.
export async function SandboxBanner() {
  const isSandbox = process.env.COMPROBIFY_SANDBOX === 'true';

  if (!isSandbox) return null;

  const t = await getTranslations('sandbox');

  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {t('banner')}
    </div>
  );
}
