'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { recoverAccountAction, type RecoverAccountActionResult } from '@/app/actions/recovery';
import { Check, Copy, Eye, EyeOff, MailCheck } from 'lucide-react';

type SuccessResult = Extract<RecoverAccountActionResult, { ok: true }>;

export function RecoverAccountForm() {
  const t = useTranslations('recoverAccount');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyKey(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
    if (!result.matched || result.linked) {
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

    // matched && !linked: show the recovered key once, for the user to paste
    // into the "link existing account" tab after logging in.
    return (
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-500/10">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('unlinkedTitle')}</p>
          <p className="text-xs text-green-700 dark:text-green-400">{t('showOnce')}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded bg-white/60 px-2 py-1 font-mono text-xs break-all dark:bg-black/20">
              {showKey ? result.apiKey : '•'.repeat(40)}
            </code>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? t('hide') : t('show')}
              className="shrink-0 text-green-700 dark:text-green-400"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => copyKey(result.apiKey)}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {t('copy')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('unlinkedInstructions')}</p>
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
