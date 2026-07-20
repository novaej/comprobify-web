import { getTranslations } from 'next-intl/server';
import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The fixed SRI comprobante catalog, in the order the SRI itself lists them.
 * This is *not* a capability list — which of these Comprobify can actually
 * issue comes from the API (see `supported` below). Codes present here but not
 * in `supported` render as "coming soon".
 */
const SRI_DOCUMENT_TYPES = ['01', '04', '05', '06', '07'] as const;

/**
 * Supported-document-types strip.
 *
 * `supported` is derived from the public `GET /v1/tiers` catalog rather than
 * hardcoded — see the caller in `(marketing)/page.tsx`. When a new builder
 * ships on the API side and lands in a tier's `allowedDocumentTypes`, this
 * strip promotes it from "coming soon" to supported on its own.
 */
export async function LandingDocTypes({ supported }: { supported: string[] }) {
  const t = await getTranslations('landing.docTypes');
  const tLabels = await getTranslations('settings.setup');

  return (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t('title')}</h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t('subtitle')}</p>

      <ul className="mt-8 flex flex-wrap justify-center gap-2.5">
        {SRI_DOCUMENT_TYPES.map((code) => {
          const isSupported = supported.includes(code);
          return (
            <li key={code}>
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
                  isSupported
                    ? 'border-primary/30 bg-primary/5 font-medium text-foreground'
                    : 'border-dashed border-border text-muted-foreground',
                )}
              >
                {isSupported ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                {tLabels(`docType${code}`)}
                <span className="font-mono text-xs opacity-60">{code}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-sm text-muted-foreground">{t('upcomingNote')}</p>
    </div>
  );
}
