import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAgreementStatusAction } from '@/app/actions/agreements';
import { AgreementAcceptance } from '@/components/agreement-acceptance';

export default async function AgreementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agreements');

  const status = await getAgreementStatusAction();

  // On error (e.g. no tenant yet), let the locale layout's error boundary handle it.
  if ('error' in status) {
    throw new Error(status.error);
  }

  // If all agreements are already accepted (or none have been published yet),
  // skip the acceptance step and go straight to the dashboard.
  if (!status.needsAcceptance) {
    redirect({ href: '/dashboard', locale });
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8 px-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <AgreementAcceptance outdated={status.outdated} />
    </div>
  );
}
