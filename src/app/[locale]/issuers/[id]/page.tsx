import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { listIssuerDocumentTypes, listTenantIssuers } from '@/lib/api';
import { getIssuerSequentialsAction } from '@/app/actions/issuers';
import { PageHeader } from '@/components/page-header';
import { IssuerEditForm } from '@/components/issuer-edit-form';

export default async function IssuerEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('issuers');

  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const issuerId = Number(id);
  if (!Number.isInteger(issuerId)) notFound();

  const issuer = await db.issuer.findFirst({
    where: { id: issuerId, tenantId: ctx.tenant.id, active: true },
  });
  if (!issuer) notFound();

  const [documentTypes, apiIssuers, sequentialsResult] = await Promise.all([
    listIssuerDocumentTypes({ apiKey: ctx.apiKey }, issuer.apiIssuerId).catch(() => [] as string[]),
    listTenantIssuers({ apiKey: ctx.apiKey }).catch(() => []),
    getIssuerSequentialsAction(issuerId),
  ]);

  const apiIssuer = apiIssuers.find((a) => a.id === String(issuer.apiIssuerId));
  const sequentials = 'sequentials' in sequentialsResult ? sequentialsResult.sequentials : [];

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('editPage.title')} backHref="/issuers" backLabel={t('title')} />
      <IssuerEditForm
        issuer={{
          id: issuer.id,
          ruc: apiIssuer?.ruc ?? '',
          businessName: issuer.businessName,
          tradeName: issuer.tradeName,
          branchAddress: issuer.branchAddress,
          branchCode: issuer.branchCode,
          issuePointCode: issuer.issuePointCode,
          certFingerprint: apiIssuer?.certFingerprint ?? null,
          certExpiry: apiIssuer?.certExpiry ?? null,
        }}
        documentTypes={documentTypes}
        initialSequentials={sequentials}
        tenantEnvironment={ctx.tenant.environment}
      />
    </div>
  );
}
