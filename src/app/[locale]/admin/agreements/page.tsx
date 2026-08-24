import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listAgreementVersions, type AdminAgreementVersion } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { AdminAgreementManager } from '@/components/admin-agreement-manager';
import { AdminRateLimitNotice } from '@/components/admin-rate-limit-notice';
import { ApiError } from '@/lib/errors';
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

  let data: {
    termVersions: AdminAgreementVersion[];
    privacyVersions: AdminAgreementVersion[];
    dpaVersions: AdminAgreementVersion[];
    drafts: Record<string, AgreementDraftData>;
  } | null;
  try {
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

    data = { termVersions, privacyVersions, dpaVersions, drafts };
  } catch (err) {
    if (!(err instanceof ApiError) || !err.isRateLimit()) throw err;
    data = null;
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      {data === null ? (
        <AdminRateLimitNotice />
      ) : (
        <AdminAgreementManager
          termVersions={data.termVersions}
          privacyVersions={data.privacyVersions}
          dpaVersions={data.dpaVersions}
          drafts={data.drafts}
        />
      )}
    </div>
  );
}
