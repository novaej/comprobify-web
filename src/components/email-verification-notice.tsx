'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { resendVerificationAction } from '@/app/actions/tenant';
import { MailCheck, MailWarning } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

// Rendered by [locale]/layout.tsx on every authenticated page (Owner only)
// while the tenant is pending email verification — a fresh signup, or an
// account recovered via /recover-account, which the API always re-demotes.
// The layout itself live-checks status while pending, so this banner clears
// on the very next reload/navigation once verified — no "check now" button.
export function EmailVerificationNotice() {
  const t = useTranslations('settings.verification');
  const tError = useTranslations('apiError');
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
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (!result) {
        setSent(true);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else if (result.error === 'ALREADY_VERIFIED') {
        // The local status mirror just hadn't caught up yet (e.g. verified in
        // another tab) — treat it as verified rather than showing an error.
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
        {error && <p className="pt-1 text-xs text-destructive">{error}</p>}
      </div>
      <button
        onClick={handleResend}
        disabled={isPending || cooldown > 0}
        className="shrink-0 cursor-pointer text-xs font-medium underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
      >
        {isPending ? t('sending') : cooldown > 0 ? t('cooldown', { seconds: cooldown }) : t('resend')}
      </button>
    </div>
  );
}
