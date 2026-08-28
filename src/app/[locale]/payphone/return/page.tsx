import type { ReactNode } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle, Clock, HelpCircle, type LucideIcon } from 'lucide-react';
import { confirmPayphonePaymentAction } from '@/app/actions/billing';
import { cn } from '@/lib/utils';

// Payphone redirects the browser here after the Cajita de Pagos widget
// completes (ADR-028) — the return URL registered in Payphone's developer
// console is fixed to this locale's path (/es/payphone/return), since the
// widget config has no per-session responseUrl field to vary it. The path
// segments stay English (matching every other route in this app — content is
// Spanish-default, URLs are not) even though only the Spanish locale prefix
// is ever actually registered.
//
// The confirm call below fires unconditionally on render, never behind a
// click: Payphone auto-reverses any charge not confirmed within 5 minutes of
// payment, so this page cannot afford to wait on client-side JS or user
// interaction. It is also safe to reload — confirming twice with the same
// arguments returns the stored outcome without contacting Payphone again.
export default async function PayphoneReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string; clientTransactionId?: string }>;
}) {
  const { locale } = await params;
  const { id, clientTransactionId } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('billing.payphone.return');
  const tError = await getTranslations('apiError');

  if (!id || !clientTransactionId) {
    return (
      <StatusCard icon={HelpCircle} tone="muted" title={t('missingParamsTitle')} description={t('missingParamsDescription')}>
        <BillingLink label={t('backToBilling')} />
      </StatusCard>
    );
  }

  const result = await confirmPayphonePaymentAction(id, clientTransactionId);

  if ('error' in result) {
    // A transport failure means the charge is UNRESOLVED, not declined — the
    // reconciliation job settles it within ~5 minutes. Never invite a retry here.
    if (result.error === 'PAYPHONE_CONFIRM_FAILED') {
      return <StatusCard icon={Clock} tone="amber" title={t('unresolvedTitle')} description={t('unresolvedDescription')} />;
    }
    return (
      <StatusCard
        icon={XCircle}
        tone="destructive"
        title={t('errorTitle')}
        description={tError.has(result.error as Parameters<typeof tError>[0]) ? tError(result.error as Parameters<typeof tError>[0]) : tError('UNKNOWN')}
      >
        <BillingLink label={t('backToBilling')} />
      </StatusCard>
    );
  }

  switch (result.status) {
    case 'APPROVED':
      return (
        <StatusCard icon={CheckCircle2} tone="green" title={t('approvedTitle')} description={t('approvedDescription')}>
          <BillingLink label={t('backToBilling')} primary />
        </StatusCard>
      );
    case 'CANCELLED':
      return (
        <StatusCard icon={XCircle} tone="muted" title={t('cancelledTitle')} description={t('cancelledDescription')}>
          <BillingLink label={t('backToBilling')} primary />
        </StatusCard>
      );
    case 'DUPLICATE':
      return (
        <StatusCard icon={AlertTriangle} tone="amber" title={t('duplicateTitle')} description={t('duplicateDescription')}>
          <SupportLink label={t('goToSupport')} />
        </StatusCard>
      );
    case 'ERROR':
      return (
        <StatusCard icon={XCircle} tone="destructive" title={t('errorTitle')} description={t('errorDescription')}>
          <SupportLink label={t('goToSupport')} />
        </StatusCard>
      );
  }
}

const TONE_STYLES = {
  green: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400',
  destructive: 'bg-destructive/10 text-destructive',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  muted: 'bg-muted text-muted-foreground',
} as const;

function StatusCard({
  icon: Icon,
  tone,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONE_STYLES;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className={cn('mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full', TONE_STYLES[tone])}>
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

function BillingLink({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <Link href="/settings/billing" className={cn(buttonVariants({ variant: primary ? 'default' : 'outline' }), 'cursor-pointer')}>
      {label}
    </Link>
  );
}

function SupportLink({ label }: { label: string }) {
  return (
    <Link href="/support" className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer')}>
      {label}
    </Link>
  );
}
