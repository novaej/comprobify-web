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
      className="mb-6 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {t('banner')}
    </div>
  );
}
