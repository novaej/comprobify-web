import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { ApiKeyManager } from '@/components/api-key-manager';
import { findAppApiKeyRow } from '@/lib/tenant-api-key';

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('apiKeys');
  const tSettings = await getTranslations('settings');

  const ctx = await requirePermission('apikeys.read', { skipIssuer: true });

  const [keys, appKey] = await Promise.all([
    db.tenantApiKey.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: 'desc' },
    }),
    findAppApiKeyRow(ctx.tenant.id, ctx.tenant.environment),
  ]);

  const canManage = ctx.permissions.has('apikeys.manage');
  const hasActiveKey = keys.some((k) => k.isActive);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        backHref="/settings"
        backLabel={tSettings('title')}
      />
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
        missingKey={!hasActiveKey}
        appKeyId={appKey?.id ?? null}
        environment={ctx.tenant.environment}
        apiBaseUrl={process.env.COMPROBIFY_API_URL ?? ''}
      />
    </div>
  );
}
