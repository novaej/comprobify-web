import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AlertTriangle } from 'lucide-react';

interface PastDueBannerProps {
  isPastDue: boolean;
}

// PAST_DUE is deliberately distinct from SUSPENDED (ADR-025 on the API side):
// it's a self-resolving billing state, not an admin-imposed suspension, so
// this banner uses an amber warning tone (not destructive/red) and CTA copy
// that points at the self-service recovery path.
export async function PastDueBanner({ isPastDue }: PastDueBannerProps) {
  if (!isPastDue) return null;

  const t = await getTranslations('pastDue');

  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{t('banner')}</span>
      <Link href="/settings/billing" className="shrink-0 font-medium underline underline-offset-4 hover:opacity-80">
        {t('bannerLink')}
      </Link>
    </div>
  );
}
