import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ProductionPromotion } from '@/components/production-promotion';
import { EmailVerificationNotice } from '@/components/email-verification-notice';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/lib/context';
import { listIssuerDocumentTypes, getMySubscriptions } from '@/lib/api';
import { listTiers } from '@/lib/public-api';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { Webhook, Bell, ChevronRight, CreditCard } from 'lucide-react';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('settings');

  const ctx = await requireContext({ skipIssuer: true });
  const { environment, id: tenantId } = ctx.tenant;
  const { email, emailVerified } = ctx.user;
  const tWebhooks = await getTranslations('webhooks');
  const tNotifPrefs = await getTranslations('notificationPreferences');
  const tBilling = await getTranslations('billing');
  const canManageWebhooks = ctx.permissions.has('webhooks.manage');
  const canManageNotifications = ctx.permissions.has('notifications.manage');
  const canReadBilling = ctx.permissions.has('billing.read');

  const defaultIssuer = await db.issuer.findFirst({
    where: { tenantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const hasIssuer = !!defaultIssuer;

  const documentTypes = defaultIssuer
    ? await listIssuerDocumentTypes({ apiKey: ctx.apiKey }, defaultIssuer.apiIssuerId).catch(() => ['01'])
    : [];

  const intendedPlan = environment === 'sandbox'
    ? await db.tenant.findUnique({
        where: { id: tenantId },
        select: { intendedTier: true, intendedBillingInterval: true },
      })
    : null;
  const tiers = environment === 'sandbox' ? await listTiers().catch(() => []) : [];

  // A subscription may already be ACTIVE from POST /v1/subscriptions, started
  // while still in sandbox via /settings/billing — promote() ignores tier/
  // billingInterval entirely in that case, so don't offer the picker for it.
  const activeSubscription = environment === 'sandbox'
    ? await getMySubscriptions({ apiKey: ctx.apiKey })
        .then((subs) => subs.find((s) => s.status === 'ACTIVE') ?? null)
        .catch(() => null)
    : null;

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        {hasIssuer && !emailVerified && <EmailVerificationNotice />}

        {hasIssuer && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('environment.title')}</h2>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    environment === 'production' ? 'bg-green-500' : 'bg-amber-400'
                  }`}
                />
                <span className="text-sm font-medium">
                  {environment === 'production'
                    ? t('environment.production')
                    : t('environment.sandbox')}
                </span>
              </div>
            </div>
            {environment === 'sandbox' && (
              <div className="mt-5 pt-5 border-t border-border">
                <ProductionPromotion
                  documentTypes={documentTypes}
                  emailVerified={emailVerified}
                  tiers={tiers}
                  intendedTier={intendedPlan?.intendedTier ?? null}
                  intendedBillingInterval={intendedPlan?.intendedBillingInterval ?? null}
                  activeSubscriptionTier={activeSubscription?.tier ?? null}
                />
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold">{t('account.title')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{email}</p>
        </div>

        {canReadBilling && (
          <Link
            href="/settings/billing"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{tBilling('title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {tBilling('description')}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}

        {canManageNotifications && (
          <Link
            href="/settings/notifications"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{tNotifPrefs('title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {tNotifPrefs('description')}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}

        {canManageWebhooks && (
          <Link
            href="/settings/webhooks"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <Webhook className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{tWebhooks('title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {tWebhooks('description')}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </div>
    </div>
  );
}
