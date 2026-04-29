import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { IssuerSetupForm } from '@/components/issuer-setup-form';
import { ProductionPromotion } from '@/components/production-promotion';
import { requireApiKey } from '@/lib/auth-token';
import { listDocumentTypes } from '@/lib/api';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('settings');

  const session = await auth();
  const environment = session?.user?.environment ?? 'sandbox';
  const hasIssuer = session?.user?.hasIssuer ?? false;

  const documentTypes = hasIssuer
    ? await requireApiKey().then((key) => listDocumentTypes(key)).catch(() => ['01'])
    : [];

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {!hasIssuer && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">{t('setup.title')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('setup.description')}</p>
          </div>
          <IssuerSetupForm />
        </div>
      )}

      {hasIssuer && (
        <>
          <div className="rounded-lg border bg-card p-6 space-y-3">
            <h2 className="font-semibold">{t('environment.title')}</h2>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${environment === 'production' ? 'bg-green-500' : 'bg-yellow-400'}`} />
              <span className="text-sm font-medium">
                {environment === 'production' ? t('environment.production') : t('environment.sandbox')}
              </span>
            </div>
            {environment === 'sandbox' && (
              <ProductionPromotion documentTypes={documentTypes} />
            )}
          </div>
        </>
      )}

      <div className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="font-semibold">{t('account.title')}</h2>
        <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
      </div>
    </div>
  );
}
