import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireContext } from '@/lib/context';
import { PageHeader } from '@/components/page-header';
import { AccountSettings } from '@/components/account-settings';

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('accountSettings');
  const tSettings = await getTranslations('settings');

  const ctx = await requireContext({ skipIssuer: true });
  const { email, firstName, lastName } = ctx.user;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        backHref="/settings"
        backLabel={tSettings('title')}
      />
      <AccountSettings email={email} firstName={firstName} lastName={lastName} />
    </div>
  );
}
