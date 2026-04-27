'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { promoteToProductionAction } from '@/app/actions/settings';
import { AlertTriangle } from 'lucide-react';

export function ProductionPromotion() {
  const t = useTranslations('settings.promote');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePromote() {
    setError(null);
    startTransition(async () => {
      const result = await promoteToProductionAction();
      if (result?.error) {
        setConfirming(false);
        setError(
          tError.has(result.error as Parameters<typeof tError>[0])
            ? tError(result.error as Parameters<typeof tError>[0])
            : result.error
        );
      }
    });
  }

  if (confirming) {
    return (
      <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>{t('warning')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={handlePromote}
          >
            {isPending ? t('confirming') : t('confirm')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirming(false)}
          >
            {t('cancel')}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">{t('emailHint')}</p>
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        {t('button')}
      </Button>
    </div>
  );
}
