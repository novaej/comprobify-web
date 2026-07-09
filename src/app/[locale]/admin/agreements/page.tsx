import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listAgreementVersions } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { AdminAgreementManager } from '@/components/admin-agreement-manager';
import type { AgreementDraftData } from '@/app/actions/admin';

export default async function AdminAgreementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.agreements');

  await requireSuperAdmin();

  const [termVersions, privacyVersions, dpaVersions, dbDrafts] = await Promise.all([
    listAgreementVersions('TERMS'),
    listAgreementVersions('PRIVACY'),
    listAgreementVersions('DPA'),
    db.agreementDraft.findMany(),
  ]);

  const drafts = Object.fromEntries(
    dbDrafts.map((d) => [
      d.documentType,
      { documentType: d.documentType, version: d.version, content: d.content, updatedAt: d.updatedAt.toISOString() } satisfies AgreementDraftData,
    ]),
  ) as Record<string, AgreementDraftData>;

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AdminAgreementManager
        termVersions={termVersions}
        privacyVersions={privacyVersions}
        dpaVersions={dpaVersions}
        drafts={drafts}
      />
    </div>
  );
}
