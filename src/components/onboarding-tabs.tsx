'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { IssuerSetupForm } from '@/components/issuer-setup-form';
import { LinkExistingAccountForm } from '@/components/link-existing-account-form';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

export function OnboardingTabs({
  intendedTier,
  intendedBillingInterval,
}: {
  intendedTier?: PaidTier;
  intendedBillingInterval?: BillingInterval;
}) {
  const t = useTranslations('onboarding');
  const [tab, setTab] = useState<'create' | 'link'>('create');

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex gap-4 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('create')}
          className={cn(
            'border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
            tab === 'create'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {t('createNewTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('link')}
          className={cn(
            'border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
            tab === 'link'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {t('linkExistingTab')}
        </button>
      </div>

      {tab === 'create' ? (
        <IssuerSetupForm
          intendedTier={intendedTier}
          intendedBillingInterval={intendedBillingInterval}
        />
      ) : (
        <LinkExistingAccountForm />
      )}
    </div>
  );
}
