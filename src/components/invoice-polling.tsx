'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tryAuthorizeAction, authorizeAction } from '@/app/actions/document';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 2 * 60 * 1_000;

interface InvoicePollingProps {
  accessKey: string;
}

export function InvoicePolling({ accessKey }: InvoicePollingProps) {
  const t = useTranslations('invoiceDetail');
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (Date.now() - startedAt.current >= TIMEOUT_MS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      const result = await tryAuthorizeAction(accessKey);
      if ('status' in result && result.status !== 'RECEIVED') {
        clearInterval(interval);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [accessKey, router]);

  if (timedOut) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
        <p className="flex-1">{t('polling.timeout')}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => authorizeAction(accessKey)}
        >
          {t('actions.authorize')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t('polling.waiting')}
    </div>
  );
}
