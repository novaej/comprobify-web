'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { resendVerificationAction } from '@/app/actions/tenant';
import { MailCheck, MailWarning } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationNotice() {
  const t = useTranslations('settings.verification');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (verified) return null;

  function handleResend() {
    // Guard against a second fire beating the disabled button's re-render —
    // this calls POST /v1/resend-verification, which has its own strict,
    // IP-keyed rate limit (5/hour, independent from register/recover's own
    // limiters — comprobify's 83c54ed).
    if (isPending || cooldown > 0) return;
    setError(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (!result) {
        setSent(true);
      } else if (result.error === 'ALREADY_VERIFIED') {
        // The page's own tenant-status check just hadn't caught up yet
        // (e.g. verified in another tab) — treat it as verified rather than
        // showing this as an error.
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
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-500/30 dark:bg-yellow-500/10">
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-300" />
        <div className="space-y-1 flex-1">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            {t('title')}
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            {t('description')}
          </p>
          {sent ? (
            <p className="flex items-center gap-1.5 text-xs text-yellow-700 dark:text-yellow-400 pt-1">
              <MailCheck className="h-3.5 w-3.5 shrink-0" />
              {t('sent')}
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={isPending || cooldown > 0}
              className="cursor-pointer pt-1 text-xs font-medium text-yellow-800 underline underline-offset-4 hover:text-yellow-900 disabled:opacity-50 dark:text-yellow-300 dark:hover:text-yellow-200"
            >
              {isPending ? t('sending') : cooldown > 0 ? t('cooldown', { seconds: cooldown }) : t('resend')}
            </button>
          )}
          {error && <p className="text-xs text-destructive pt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
