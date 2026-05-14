import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { listIssuerDocumentTypes } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { IssuerManager } from '@/components/issuer-manager';

export default async function IssuersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('issuers');

  const ctx = await requirePermission('issuers.read', { skipIssuer: true });

  const issuers = await db.issuer.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  const documentTypesPerIssuer = await Promise.all(
    issuers.map((issuer) =>
      listIssuerDocumentTypes({ apiKey: ctx.apiKey }, issuer.apiIssuerId).catch(() => [] as string[])
    )
  );

  const issuersWithTypes = issuers.map((issuer, i) => ({
    ...issuer,
    documentTypes: documentTypesPerIssuer[i],
  }));

  const canManage = ctx.permissions.has('issuers.manage');

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <IssuerManager issuers={issuersWithTypes} canManage={canManage} />
    </div>
  );
}
