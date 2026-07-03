import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Ban } from 'lucide-react';

interface SuspendedBannerProps {
  isSuspended: boolean;
}

export async function SuspendedBanner({ isSuspended }: SuspendedBannerProps) {
  if (!isSuspended) return null;

  const t = await getTranslations('suspended');

  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/15"
    >
      <Ban className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{t('banner')}</span>
      <Link href="/settings/billing" className="shrink-0 font-medium underline underline-offset-4 hover:opacity-80">
        {t('bannerLink')}
      </Link>
    </div>
  );
}
