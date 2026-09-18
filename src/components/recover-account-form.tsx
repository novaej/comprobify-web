'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { logoutAction } from '@/app/actions/auth';
import { recoverAccountAction, type RecoverAccountActionResult } from '@/app/actions/recovery';
import { MailCheck } from 'lucide-react';

type SuccessResult = Extract<RecoverAccountActionResult, { ok: true }>;

export function RecoverAccountForm() {
  const t = useTranslations('recoverAccount');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Guard against a second fire beating the disabled button's re-render —
    // this calls POST /v1/recover, which has its own strict, IP-keyed rate
    // limit (5/hour, independent from register/resend-verification's own
    // limiters — comprobify's 83c54ed).
    if (isPending) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await recoverAccountAction(formData);
      if ('error' in res) {
        setError(tError.has(res.error as Parameters<typeof tError>[0]) ? tError(res.error as Parameters<typeof tError>[0]) : tError('UNKNOWN'));
        return;
      }
      setResult(res);
    });
  }

  if (result) {
    // recoverAccountAction is entirely session-independent (see its own doc
    // comment) — a match never signs anyone in, it only ever mutates local
    // data, so every outcome here lands on a message + "back to login",
    // never a redirect. `outcome` is one of three things on a real match:
    // 'alreadyLinked' (the common case — our local hint caught it before
    // calling the API, so nothing was rotated), 'justLinked' (a genuinely
    // new link was just created and attached to the matching existing
    // login), or 'resynced' (the rare fallback — our hint missed, so the
    // API actually rotated the key and forced re-verification while
    // resyncing an already-existing link).
    const message = !result.matched
      ? t('genericMessage')
      : result.outcome === 'alreadyLinked'
        ? t('alreadyLinkedMessage')
        : result.outcome === 'justLinked'
          ? t('justLinkedMessage')
          : t('linkedMessage');

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{message}</p>
            {result.matched && result.outcome === 'alreadyLinked' && (
              <Link
                href="/forgot-password"
                className="inline-block font-medium text-primary hover:underline underline-offset-4"
              >
                {t('goToForgotPassword')}
              </Link>
            )}
          </div>
        </div>
        {/* logoutAction, not a plain Link — recovery never checks who's
            currently browsing (it matches by email+cert alone), so whoever
            clicks this needs a clean slate regardless of what session
            happens to be active. A plain Link to /login here would instead
            hit /login's own "already authenticated → redirect away" logic
            against the CURRENT session, which has nothing to do with the
            account that was just recovered. */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="block w-full text-center text-sm font-medium text-primary hover:underline underline-offset-4 cursor-pointer"
          >
            {t('backToLogin')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t('fields.email')} *</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required disabled={isPending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cert">{t('fields.certFile')} *</Label>
        <Input id="cert" name="cert" type="file" accept=".p12,.pfx" required disabled={isPending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="certPassword">{t('fields.certPassword')}</Label>
        <Input
          id="certPassword"
          name="certPassword"
          type="password"
          autoComplete="off"
          disabled={isPending}
        />
      </div>

      <p className="text-xs text-muted-foreground">{t('sideEffectNotice')}</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
