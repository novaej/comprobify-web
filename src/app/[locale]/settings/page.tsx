import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ProductionPromotion } from '@/components/production-promotion';
import { EmailVerificationNotice } from '@/components/email-verification-notice';
import { SessionTimeoutSettings } from '@/components/session-timeout-settings';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/lib/context';
import { listIssuerDocumentTypes, getMySubscriptions, getAgreementStatus } from '@/lib/api';
import { listTiers } from '@/lib/public-api';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { Webhook, Bell, ChevronRight, CreditCard, User, KeyRound } from 'lucide-react';

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
  const { email, emailVerified, firstName, lastName } = ctx.user;
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const tWebhooks = await getTranslations('webhooks');
  const tNotifPrefs = await getTranslations('notificationPreferences');
  const tBilling = await getTranslations('billing');
  const tAgreements = await getTranslations('agreements');
  const tApiKeys = await getTranslations('apiKeys');
  const canManageWebhooks = ctx.permissions.has('webhooks.manage');
  const canManageNotifications = ctx.permissions.has('notifications.manage');
  const canReadBilling = ctx.permissions.has('billing.read');
  const canReadApiKeys = ctx.permissions.has('apikeys.read');
  const canManageTenant = ctx.permissions.has('tenant.manage');
  const canPromoteTenant = ctx.permissions.has('tenant.promote');

  const activeIssuers = await db.issuer.findMany({
    where: { tenantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const hasIssuer = activeIssuers.length > 0;

  const issuersForPromotion = environment === 'sandbox' && canPromoteTenant
    ? await Promise.all(
        activeIssuers.map(async (issuer) => ({
          id: issuer.id,
          apiIssuerId: issuer.apiIssuerId,
          name: issuer.tradeName || issuer.businessName,
          branchCode: issuer.branchCode,
          issuePointCode: issuer.issuePointCode,
          documentTypes: await listIssuerDocumentTypes({ apiKey: ctx.apiKey }, issuer.apiIssuerId).catch(() => ['01']),
        }))
      )
    : [];

  const intendedPlan = environment === 'sandbox' && canPromoteTenant
    ? await db.tenant.findUnique({
        where: { id: tenantId },
        select: { intendedTier: true, intendedBillingInterval: true },
      })
    : null;
  const tiersResult = environment === 'sandbox' && canPromoteTenant ? await listTiers().catch(() => null) : null;
  const tiers = tiersResult?.tiers ?? [];

  // A subscription may already be ACTIVE from POST /v1/subscriptions, started
  // while still in sandbox via /settings/billing — promote() ignores tier/
  // billingInterval entirely in that case, so don't offer the picker for it.
  // agreementsAccepted: false only when agreements are published AND the tenant
  // hasn't accepted them yet; pre-launch (no templates) always returns true.
  const [activeSubscription, agreementStatus] = await Promise.all([
    environment === 'sandbox' && canPromoteTenant
      ? getMySubscriptions({ apiKey: ctx.apiKey })
          .then((subs) => subs.find((s) => s.status !== 'CANCELLED' && s.status !== 'EXPIRED') ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    canManageTenant
      ? getAgreementStatus({ apiKey: ctx.apiKey }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const agreementsAccepted = !agreementStatus?.needsAcceptance;

  const tenantSecurity = canManageTenant
    ? await db.tenant.findUnique({
        where: { id: tenantId },
        select: { sessionIdleTimeoutMinutes: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        {hasIssuer && !emailVerified && canManageTenant && <EmailVerificationNotice />}

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
            {environment === 'sandbox' && canPromoteTenant && (
              <div className="mt-5 pt-5 border-t border-border">
                <ProductionPromotion
                  issuers={issuersForPromotion}
                  emailVerified={emailVerified}
                  tiers={tiers}
                  intendedTier={intendedPlan?.intendedTier ?? null}
                  intendedBillingInterval={intendedPlan?.intendedBillingInterval ?? null}
                  activeSubscriptionTier={activeSubscription?.tier ?? null}
                  agreementsAccepted={agreementsAccepted}
                />
              </div>
            )}
          </div>
        )}

        <Link
          href="/settings/account"
          className="flex items-center justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">{t('account.title')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                {displayName ? `${displayName} · ` : ''}{email}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        {canManageTenant && agreementStatus?.hasPublishedAgreements && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold">{t('legalDocs.title')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('legalDocs.description')}</p>
            <div className="mt-4 divide-y divide-border">
              {(['TERMS', 'PRIVACY', 'DPA'] as const).map((type) => {
                const isPending = agreementStatus?.outdated.some((d) => d.documentType === type) ?? false;
                return (
                  <div key={type} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm">{tAgreements(`documentTitles.${type}`)}</span>
                      {isPending && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          {tAgreements('statusPending')}
                        </span>
                      )}
                    </div>
                    <a
                      href={`/api/tenant/agreements/${type}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      {t('legalDocs.view')}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canManageTenant && tenantSecurity && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold">{t('security.title')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('security.description')}</p>
            <div className="mt-4">
              <SessionTimeoutSettings
                currentValue={tenantSecurity.sessionIdleTimeoutMinutes}
              />
            </div>
          </div>
        )}

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

        {canReadApiKeys && (
          <Link
            href="/settings/api-keys"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">{tApiKeys('title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {tApiKeys('description')}
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
