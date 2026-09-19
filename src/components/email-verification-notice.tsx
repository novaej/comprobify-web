'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { resendVerificationAction, refreshTenantStatusAction } from '@/app/actions/tenant';
import { MailCheck, MailWarning } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

// Rendered by [locale]/layout.tsx on every authenticated page (Owner only)
// while the tenant is pending email verification — a fresh signup, or an
// account recovered via /recover-account, which the API always re-demotes.
export function EmailVerificationNotice() {
  const t = useTranslations('settings.verification');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [isChecking, startCheckTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [stillPending, setStillPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (verified) return null;

  function showError(code: string) {
    setError(
      tError.has(code as Parameters<typeof tError>[0])
        ? tError(code as Parameters<typeof tError>[0])
        : code
    );
  }

  function handleResend() {
    // Guard against a second fire beating the disabled button's re-render —
    // this calls POST /v1/resend-verification, which has its own strict,
    // IP-keyed rate limit (5/hour, independent from register/recover's own
    // limiters — comprobify's 83c54ed).
    if (isPending || cooldown > 0) return;
    setError(null);
    setStillPending(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (!result) {
        setSent(true);
      } else if (result.error === 'ALREADY_VERIFIED') {
        // The local status mirror just hadn't caught up yet (e.g. verified in
        // another tab) — treat it as verified rather than showing an error.
        setVerified(true);
      } else {
        showError(result.error);
      }
    });
  }

  function handleCheck() {
    if (isChecking) return;
    setError(null);
    setStillPending(false);
    startCheckTransition(async () => {
      const result = await refreshTenantStatusAction();
      if ('error' in result) showError(result.error);
      else if (result.verified) setVerified(true);
      else setStillPending(true);
    });
  }

  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 sm:flex-row sm:items-center dark:text-amber-300"
    >
      <MailWarning className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
      <div className="flex-1 space-y-0.5">
        <p className="font-medium">{t('title')}</p>
        <p className="text-xs opacity-90">{t('description')}</p>
        {sent && (
          <p className="flex items-center gap-1.5 pt-1 text-xs">
            <MailCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('sent')}
          </p>
        )}
        {stillPending && <p className="pt-1 text-xs">{t('stillPending')}</p>}
        {error && <p className="pt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        {!sent && (
          <button
            onClick={handleResend}
            disabled={isPending || cooldown > 0}
            className="cursor-pointer text-xs font-medium underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
          >
            {isPending ? t('sending') : cooldown > 0 ? t('cooldown', { seconds: cooldown }) : t('resend')}
          </button>
        )}
        <button
          onClick={handleCheck}
          disabled={isChecking}
          className="cursor-pointer text-xs font-medium underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
        >
          {isChecking ? t('checking') : t('checkStatus')}
        </button>
      </div>
    </div>
  );
}
