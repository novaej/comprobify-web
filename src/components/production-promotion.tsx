'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { promoteTenantAction } from '@/app/actions/tenant';
import { resendVerificationAction } from '@/app/actions/tenant';
import { AlertTriangle, Info, MailCheck } from 'lucide-react';

export function ProductionPromotion({ documentTypes, emailVerified }: { documentTypes: string[]; emailVerified: boolean }) {
  const t = useTranslations('settings.promote');
  const tSetup = useTranslations('settings.setup');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [isResendPending, startResendTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [sequentials, setSequentials] = useState<Record<string, number>>(
    () => Object.fromEntries(documentTypes.map((code) => [code, 1]))
  );

  const error = errorCode
    ? (tError.has(errorCode as Parameters<typeof tError>[0])
        ? tError(errorCode as Parameters<typeof tError>[0])
        : errorCode)
    : null;

  function handlePromote() {
    setErrorCode(null);
    setResendSent(false);
    const initialSequentials = Object.entries(sequentials)
      .filter(([, seq]) => seq >= 1)
      .map(([documentType, sequential]) => ({ documentType, sequential }));
    startTransition(async () => {
      const result = await promoteTenantAction(initialSequentials);
      if (result && 'error' in result) {
        setConfirming(false);
        setErrorCode(result.error);
      }
    });
  }

  function handleResend() {
    startResendTransition(async () => {
      const result = await resendVerificationAction();
      if (!result) {
        setResendSent(true);
      } else if ('error' in result) {
        setErrorCode(result.error);
      }
    });
  }

  if (confirming) {
    return (
      <div className="space-y-4">
        {/* Production sequentials */}
        <div className="rounded-md border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">{t('sequentials')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sequentialsHint')}</p>
          </div>
          <div className="divide-y divide-border rounded-md border">
            {documentTypes.map((code) => (
              <div key={code} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 text-sm">
                  {tSetup(`docType${code}` as Parameters<typeof tSetup>[0])}
                  <span className="ml-1.5 text-xs text-muted-foreground">({code})</span>
                </span>
                <Input
                  type="number"
                  min={1}
                  value={sequentials[code] ?? 1}
                  onChange={(e) =>
                    setSequentials((prev) => ({
                      ...prev,
                      [code]: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="w-24 text-right"
                  disabled={isPending}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Irreversibility warning */}
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-3">
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
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <div
        role="note"
        className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{t('sriNotice')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={!emailVerified}>
        {t('button')}
      </Button>
      {!emailVerified && (
        <p className="text-xs text-muted-foreground">{t('emailRequired')}</p>
      )}
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
            className="cursor-pointer text-sm underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {isResendPending ? t('resending') : t('resend')}
          </button>
        )
      )}
    </div>
  );
}
