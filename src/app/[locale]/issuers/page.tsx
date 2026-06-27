import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { listIssuerDocumentTypes, listTenantIssuers } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { IssuerManager } from '@/components/issuer-manager';
import { CreateIssuerDialog } from '@/components/create-issuer-dialog';

export default async function IssuersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('issuers');

  const ctx = await requirePermission('issuers.read', { skipIssuer: true });

  // Includes inactive issuers too, so a deactivated one can still be shown
  // (greyed out) with a way to reactivate it — only active ones are eligible
  // as a "source" to inherit from when creating a new branch/issue point.
  const issuers = await db.issuer.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ active: 'desc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const activeIssuers = issuers.filter((i) => i.active);

  const [documentTypesPerIssuer, apiIssuers] = await Promise.all([
    Promise.all(
      issuers.map((issuer) =>
        listIssuerDocumentTypes({ apiKey: ctx.apiKey }, issuer.apiIssuerId).catch(() => [] as string[])
      )
    ),
    listTenantIssuers({ apiKey: ctx.apiKey }).catch(() => []),
  ]);

  const issuersWithTypes = issuers.map((issuer, i) => {
    const apiIssuer = apiIssuers.find((a) => a.id === String(issuer.apiIssuerId));
    return {
      ...issuer,
      documentTypes: documentTypesPerIssuer[i],
      certFingerprint: apiIssuer?.certFingerprint ?? null,
      certExpiry: apiIssuer?.certExpiry ?? null,
    };
  });

  const canManage = ctx.permissions.has('issuers.manage');

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={canManage ? <CreateIssuerDialog issuers={activeIssuers} /> : undefined}
      />
      <IssuerManager issuers={issuersWithTypes} canManage={canManage} />
    </div>
  );
}
