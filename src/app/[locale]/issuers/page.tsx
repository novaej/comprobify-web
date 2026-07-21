import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { listIssuerDocumentTypes, listTenantIssuers, getCurrentTenant } from '@/lib/api';
import { listTiers } from '@/lib/public-api';
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

  // Owner/Admin see all issuers (including inactive for management).
  // Other roles see only their assigned issuers (active only — they can't manage).
  const isOwnerOrAdmin = ctx.user.role === 'Owner' || ctx.user.role === 'Admin';
  let accessibleIds: string[] | null = null;
  if (!isOwnerOrAdmin) {
    const userAccess = await db.userIssuerAccess.findMany({
      where: { tenantId: ctx.tenant.id, userId: ctx.user.id },
      select: { issuerId: true },
    });
    accessibleIds = userAccess.map((a) => a.issuerId);
  }

  // Includes inactive issuers for Owner/Admin so a deactivated one can be shown
  // (greyed out) with a way to reactivate it.
  const issuers = await db.issuer.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(accessibleIds !== null ? { id: { in: accessibleIds } } : {}),
      ...(accessibleIds !== null ? { active: true } : {}),
    },
    orderBy: [{ active: 'desc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const activeIssuers = issuers.filter((i) => i.active);

  const [documentTypesPerIssuer, apiIssuers, tenantInfo, tiers] = await Promise.all([
    Promise.all(
      issuers.map((issuer) =>
        listIssuerDocumentTypes({ apiKey: ctx.apiKey }, issuer.apiIssuerId).catch(() => [] as string[])
      )
    ),
    listTenantIssuers({ apiKey: ctx.apiKey }).catch(() => []),
    getCurrentTenant({ apiKey: ctx.apiKey }),
    listTiers().catch(() => []),
  ]);

  const currentTier = tiers.find((t) => t.name === tenantInfo.subscriptionTier);
  const allowedDocumentTypes = currentTier?.allowedDocumentTypes ?? ['01'];

  const issuersWithTypes = issuers.map((issuer, i) => {
    const apiIssuer = apiIssuers.find((a) => a.id === issuer.apiIssuerId);
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
        action={canManage ? <CreateIssuerDialog issuers={activeIssuers} allowedDocumentTypes={allowedDocumentTypes} /> : undefined}
      />
      <IssuerManager issuers={issuersWithTypes} canManage={canManage} allowedDocumentTypes={allowedDocumentTypes} />
    </div>
  );
}
