import { getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';

interface SandboxBannerProps {
  environment: string;
}

export async function SandboxBanner({ environment }: SandboxBannerProps) {
  if (environment !== 'sandbox') return null;

  const t = await getTranslations('sandbox');

  return (
    <div
      role="alert"
      className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {t('banner')}
    </div>
  );
}
