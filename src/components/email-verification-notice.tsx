'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { resendVerificationAction } from '@/app/actions/settings';
import { MailCheck, MailWarning } from 'lucide-react';

export function EmailVerificationNotice() {
  const t = useTranslations('settings.verification');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (verified) return null;

  function handleResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (!result) {
        setSent(true);
      } else if ('verified' in result) {
        setVerified(true);
      } else {
        setError(
          tError.has(result.error as Parameters<typeof tError>[0])
            ? tError(result.error as Parameters<typeof tError>[0])
            : result.error
        );
      }
    });
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-950/20">
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500" />
        <div className="space-y-1 flex-1">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
            {t('title')}
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-500">
            {t('description')}
          </p>
          {sent ? (
            <p className="flex items-center gap-1.5 text-xs text-yellow-700 dark:text-yellow-500 pt-1">
              <MailCheck className="h-3.5 w-3.5 shrink-0" />
              {t('sent')}
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={isPending}
              className="pt-1 text-xs font-medium text-yellow-800 underline underline-offset-4 hover:text-yellow-900 disabled:opacity-50 dark:text-yellow-400 dark:hover:text-yellow-300"
            >
              {isPending ? t('sending') : t('resend')}
            </button>
          )}
          {error && <p className="text-xs text-destructive pt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
