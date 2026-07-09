'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorBoundary');
  const tCommon = useTranslations('common');
  const tApiError = useTranslations('apiError');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{tApiError('UNKNOWN')}</p>
      <div className="flex gap-3">
        <Button onClick={reset}>{tCommon('retry')}</Button>
        <Link href="/admin/tenants" className={buttonVariants({ variant: 'outline' })}>
          {t('backToAdmin')}
        </Link>
      </div>
    </div>
  );
}
