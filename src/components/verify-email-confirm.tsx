'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, MailCheck } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { confirmEmailVerificationAction } from '@/app/actions/auth';

interface VerifyEmailConfirmProps {
  token: string;
}

export function VerifyEmailConfirm({ token }: VerifyEmailConfirmProps) {
  const t = useTranslations('verifyEmail');
  const tApiError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorCode, setErrorCode] = useState<string | null>(null);

  function handleConfirm() {
    // Guard against a second fire beating the disabled button's re-render —
    // POST /v1/verify-email has no rate limit at all (a single-use token
    // makes it a poor abuse vector), so this is purely to avoid a wasted
    // duplicate call, not a shared-budget concern.
    if (isPending) return;
    startTransition(async () => {
      const result = await confirmEmailVerificationAction(token);
      if (result?.error) {
        setErrorCode(result.error);
        setStatus('error');
      } else {
        setStatus('success');
      }
    });
  }

  if (status === 'success') {
    return (
      <>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 mb-4">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{t('successTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('successDescription')}</p>
        <div className="mt-6">
          <Link href="/settings" className={buttonVariants() + ' cursor-pointer'}>
            {t('goToSettings')}
          </Link>
        </div>
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-destructive mb-4">
          <XCircle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{t('errorTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {errorCode && tApiError.has(errorCode) ? tApiError(errorCode) : t('errorDescription')}
        </p>
        <div className="mt-6">
          <Link href="/settings" className={buttonVariants() + ' cursor-pointer'}>
            {t('goToSettings')}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
        <MailCheck className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{t('confirmTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('confirmDescription')}</p>
      <Button onClick={handleConfirm} disabled={isPending} className="mt-6 w-full cursor-pointer">
        {isPending ? t('confirming') : t('confirmButton')}
      </Button>
    </>
  );
}
