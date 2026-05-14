import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { ApiKeyManager } from '@/components/api-key-manager';

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('apiKeys');

  const ctx = await requirePermission('apikeys.read', { skipIssuer: true });

  const keys = await db.tenantApiKey.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
  });

  const canManage = ctx.permissions.has('apikeys.manage');
  const hasActiveKey = keys.some((k) => k.isActive);

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ApiKeyManager
        keys={keys.map((k) => ({
          id: k.id,
          label: k.label,
          environment: k.environment,
          lastFour: k.lastFour,
          isActive: k.isActive,
          createdAt: k.createdAt.toISOString(),
        }))}
        canManage={canManage}
        hasActiveKey={hasActiveKey}
        missingKey={!hasActiveKey}
      />
    </div>
  );
}
