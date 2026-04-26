'use client';

import { useState, useTransition, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setupIssuerAction } from '@/app/actions/settings';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function IssuerSetupForm() {
  const t = useTranslations('settings.setup');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await setupIssuerAction(formData);
      if (result?.error) {
        setError(
          tError.has(result.error as Parameters<typeof tError>[0])
            ? tError(result.error as Parameters<typeof tError>[0])
            : result.error
        );
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ruc">{t('ruc')} *</Label>
          <Input id="ruc" name="ruc" required disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="businessName">{t('businessName')} *</Label>
          <Input id="businessName" name="businessName" required disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tradeName">{t('tradeName')}</Label>
          <Input id="tradeName" name="tradeName" disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mainAddress">{t('mainAddress')}</Label>
          <Input id="mainAddress" name="mainAddress" disabled={isPending} />
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <p className="text-sm font-medium">{t('certSection')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cert">{t('certFile')} *</Label>
            <Input
              id="cert"
              name="cert"
              type="file"
              accept=".p12,.pfx"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="certPassword">{t('certPassword')}</Label>
            <Input
              id="certPassword"
              name="certPassword"
              type="password"
              autoComplete="off"
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {t('advanced')}
      </button>

      {showAdvanced && (
        <div className="grid gap-4 sm:grid-cols-2 rounded-md border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="branchCode">{t('branchCode')}</Label>
            <Input id="branchCode" name="branchCode" defaultValue="001" disabled={isPending} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issuePointCode">{t('issuePointCode')}</Label>
            <Input id="issuePointCode" name="issuePointCode" defaultValue="001" disabled={isPending} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
