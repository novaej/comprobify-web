import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IssuerSetupForm } from '@/components/issuer-setup-form';
import { ProductionPromotion } from '@/components/production-promotion';
import { EmailVerificationNotice } from '@/components/email-verification-notice';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/lib/context';
import { listDocumentTypes } from '@/lib/api';
import { db } from '@/lib/db';

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

  const issuerCount = await db.issuer.count({ where: { tenantId } });
  const hasIssuer = issuerCount > 0;

  const documentTypes = hasIssuer
    ? await listDocumentTypes(ctx.apiKey).catch(() => ['01'])
    : [];

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        {!hasIssuer && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-semibold">{t('setup.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('setup.description')}</p>
            </div>
            <IssuerSetupForm />
          </div>
        )}

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
                <ProductionPromotion documentTypes={documentTypes} emailVerified={emailVerified} />
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold">{t('account.title')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{email}</p>
        </div>
      </div>
    </div>
  );
}
