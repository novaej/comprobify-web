'use client';

import { useState, useTransition, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { bootstrapTenantAction } from '@/app/actions/onboarding';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

const DOC_TYPES = [
  { code: '01', defaultEnabled: true },
  { code: '04', defaultEnabled: false },
  { code: '05', defaultEnabled: false },
  { code: '06', defaultEnabled: false },
  { code: '07', defaultEnabled: false },
] as const;

export function IssuerSetupForm({
  intendedTier,
  intendedBillingInterval,
  showAgreementNotice,
}: {
  intendedTier?: PaidTier;
  intendedBillingInterval?: BillingInterval;
  showAgreementNotice: boolean;
}) {
  const t = useTranslations('settings.setup');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(DOC_TYPES.filter((d) => d.defaultEnabled).map((d) => d.code))
  );
  const formRef = useRef<HTMLFormElement>(null);

  function toggleType(code: string, checked: boolean) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setErrorCode(null);
    startTransition(async () => {
      try {
        const result = await bootstrapTenantAction(formData);
        if (result && 'error' in result) {
          const code = result.error;
          setErrorCode(code);
          setError(tError.has(code as Parameters<typeof tError>[0])
            ? tError(code as Parameters<typeof tError>[0])
            : tError('UNKNOWN'));
        }
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err;
        setError(tError('UNKNOWN'));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {intendedTier && <input type="hidden" name="intendedTier" value={intendedTier} />}
      {intendedTier && (
        <input
          type="hidden"
          name="intendedBillingInterval"
          value={intendedBillingInterval ?? 'MONTHLY'}
        />
      )}
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
        <div className="space-y-6 rounded-md border p-4">
          {/* Branch / issue point */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="branchCode">{t('branchCode')}</Label>
              <Input id="branchCode" name="branchCode" defaultValue="001" disabled={isPending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issuePointCode">{t('issuePointCode')}</Label>
              <Input id="issuePointCode" name="issuePointCode" defaultValue="001" disabled={isPending} />
            </div>
          </div>

          {/* Required accounting */}
          <div className="flex items-start gap-3">
            <input
              id="requiredAccounting"
              name="requiredAccounting"
              type="checkbox"
              disabled={isPending}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <div className="space-y-0.5">
              <Label htmlFor="requiredAccounting" className="font-normal cursor-pointer">
                {t('requiredAccounting')}
              </Label>
              <p className="text-xs text-muted-foreground">{t('requiredAccountingHint')}</p>
            </div>
          </div>

          {/* Company logo */}
          <div className="space-y-1.5">
            <Label htmlFor="logo">{t('logoFile')}</Label>
            <Input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/gif"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">{t('logoHint')}</p>
          </div>

          {/* Initial sequentials */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('sequentials')}</p>
            <p className="text-xs text-muted-foreground">{t('sequentialsHint')}</p>
            <div className="mt-2 divide-y divide-border rounded-md border">
              {DOC_TYPES.map(({ code }) => {
                const enabled = enabledTypes.has(code);
                return (
                  <div key={code} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      id={`seq_enabled_${code}`}
                      checked={enabled}
                      onChange={(e) => toggleType(code, e.target.checked)}
                      disabled={isPending}
                      className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <label
                      htmlFor={`seq_enabled_${code}`}
                      className="flex-1 cursor-pointer text-sm"
                    >
                      <span>{t(`docType${code}` as Parameters<typeof t>[0])}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">({code})</span>
                    </label>
                    <Input
                      name={`seq_${code}`}
                      type="number"
                      min={1}
                      defaultValue={1}
                      disabled={!enabled || isPending}
                      className="w-24 text-right"
                      aria-label={t(`docType${code}` as Parameters<typeof t>[0])}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showAgreementNotice && (
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{t('agreementNotice')}</p>
        </div>
      )}

      {error && (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          {errorCode === 'CONFLICT' && (
            <Link href="/recover-account" className="text-sm underline underline-offset-4 hover:text-foreground">
              {t('recoverAccountLink')}
            </Link>
          )}
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
