import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listAgreementVersions } from '@/lib/admin-api';
import { PageHeader } from '@/components/page-header';
import { AdminAgreementManager } from '@/components/admin-agreement-manager';

export default async function AdminAgreementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.agreements');

  await requireSuperAdmin();

  const [termVersions, privacyVersions, dpaVersions] = await Promise.all([
    listAgreementVersions('TERMS'),
    listAgreementVersions('PRIVACY'),
    listAgreementVersions('DPA'),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminAgreementManager
        termVersions={termVersions}
        privacyVersions={privacyVersions}
        dpaVersions={dpaVersions}
      />
    </div>
  );
}
