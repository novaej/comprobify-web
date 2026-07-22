'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { linkExistingTenantAction, resendVerificationForLinkingAction } from '@/app/actions/onboarding';
import { MailCheck } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

export function LinkExistingAccountForm() {
  const t = useTranslations('onboarding');
  const tVerification = useTranslations('settings.verification');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const [isResending, startResend] = useTransition();
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setVerificationEmail(null);
    startTransition(async () => {
      try {
        const result = await linkExistingTenantAction(formData);
        if (result && 'error' in result) {
          const code = result.error;
          setError(tError.has(code as Parameters<typeof tError>[0])
            ? tError(code as Parameters<typeof tError>[0])
            : tError('UNKNOWN'));
          if (code === 'EMAIL_VERIFICATION_REQUIRED' && result.email) {
            setVerificationEmail(result.email);
          }
        }
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err;
        setError(tError('UNKNOWN'));
      }
    });
  }

  function handleResend() {
    if (!verificationEmail) return;
    setResendError(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    startResend(async () => {
      const result = await resendVerificationForLinkingAction(verificationEmail);
      if (result?.error) {
        setResendError(
          tError.has(result.error as Parameters<typeof tError>[0])
            ? tError(result.error as Parameters<typeof tError>[0])
            : tError('UNKNOWN')
        );
      } else {
        setResendSent(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('linkDescription')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="apiKey">{t('apiKey')} *</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          required
          disabled={isPending}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {verificationEmail && (
        <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
          {resendSent ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MailCheck className="h-3.5 w-3.5 shrink-0" />
              {tVerification('sent')}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="cursor-pointer text-xs font-medium text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
            >
              {isResending
                ? tVerification('sending')
                : cooldown > 0
                  ? tVerification('cooldown', { seconds: cooldown })
                  : tVerification('resend')}
            </button>
          )}
          {resendError && <p className="text-xs text-destructive">{resendError}</p>}
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? t('linkSubmitting') : t('linkSubmit')}
      </Button>
    </form>
  );
}
