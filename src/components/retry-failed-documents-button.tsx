'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retryFailedDocumentsAction } from '@/app/actions/document';
import { toastApiError } from '@/lib/api-error-toast';

export function RetryFailedDocumentsButton() {
  const t = useTranslations('documents');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await retryFailedDocumentsAction();
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      toast(result.retried > 0
        ? t('retryFailed.success', { count: result.retried })
        : t('retryFailed.none'));
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      {t('retryFailed.button')}
    </Button>
  );
}
