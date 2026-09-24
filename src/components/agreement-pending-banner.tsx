'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AlertTriangle, X } from 'lucide-react';
import { getAgreementStatusAction } from '@/app/actions/agreements';

export const AGREEMENTS_ACCEPTED_EVENT = 'comprobify:agreements-accepted';

// Checked once per mount, not per navigation — the layout (and this banner)
// persists across soft navigations, and refetching on every route change burned
// the API's per-key read rate limit. Acceptance hides it via AGREEMENTS_ACCEPTED_EVENT.
export function AgreementPendingBanner() {
  const t = useTranslations('agreementBanner');
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAgreementStatusAction().then((result) => {
      if (!cancelled) setPending(!('error' in result) && result.needsAcceptance);
    });
    const onAccepted = () => setPending(false);
    window.addEventListener(AGREEMENTS_ACCEPTED_EVENT, onAccepted);
    return () => {
      cancelled = true;
      window.removeEventListener(AGREEMENTS_ACCEPTED_EVENT, onAccepted);
    };
  }, []);

  if (!pending || dismissed) return null;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{t('title')}</p>
        <p className="mt-0.5 text-xs opacity-80">{t('message')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/agreements"
          className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
        >
          {t('action')}
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('dismiss')}
          className="rounded p-0.5 transition-colors hover:bg-amber-200/60 dark:hover:bg-amber-500/20"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
