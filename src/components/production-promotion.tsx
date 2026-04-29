'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { promoteToProductionAction, resendVerificationAction } from '@/app/actions/settings';
import { AlertTriangle, MailCheck } from 'lucide-react';

export function ProductionPromotion() {
  const t = useTranslations('settings.promote');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [isResendPending, startResendTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);

  const error = errorCode
    ? (tError.has(errorCode as Parameters<typeof tError>[0])
        ? tError(errorCode as Parameters<typeof tError>[0])
        : errorCode)
    : null;

  function handlePromote() {
    setErrorCode(null);
    setResendSent(false);
    startTransition(async () => {
      const result = await promoteToProductionAction();
      if (result?.error) {
        setConfirming(false);
        setErrorCode(result.error);
      }
    });
  }

  function handleResend() {
    startResendTransition(async () => {
      const result = await resendVerificationAction();
      if (!result?.error) {
        setResendSent(true);
      } else {
        setErrorCode(result.error);
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      {errorCode === 'EMAIL_NOT_VERIFIED' && (
        resendSent ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MailCheck className="h-4 w-4 shrink-0" />
            {t('resendSent')}
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={isResendPending}
            className="text-sm underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {isResendPending ? t('resending') : t('resend')}
          </button>
        )
      )}
    </div>
  );
}
