'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
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
    // A successful first-time link redirects the action itself (see
    // recoverAccountAction) — a returned `matched: true` here always means
    // the tenant was already linked and its key was just rotated.
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {result.matched ? t('linkedMessage') : t('genericMessage')}
          </p>
        </div>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          {t('backToLogin')}
        </Link>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
