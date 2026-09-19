import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { ApiKeyManager } from '@/components/api-key-manager';
import { listTenantApiKeys } from '@/lib/api';
import { computeApiScopesForRole } from '@/lib/role-api-scopes';

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

  const [keys, { keys: apiKeyInfos, limit: apiKeyLimit }] = await Promise.all([
    db.tenantApiKey.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: 'desc' },
    }),
    // Lifetime lastUsedAt/requestCount live only on the API side — the local
    // TenantApiKey mirror has no columns for them. `limit` is the tenant's
    // own self-service pool (comprobify-web's reserved master/per-role keys
    // are minted through the admin-gated path and excluded entirely, see
    // tenant-api-key.ts), read directly here rather than re-derived.
    listTenantApiKeys({ apiKey: ctx.apiKey }),
  ]);

  const usageByApiKeyId = new Map(apiKeyInfos.map((info) => [info.id, info]));
  const canManage = ctx.permissions.has('apikeys.manage');
  const hasActiveKey = keys.some((k) => k.isActive);

  // apiKeyLimit.max is the tier's own raw maxApiKeys (comprobify-web's
  // reserved keys are excluded entirely as of comprobify migration 102, not
  // padded on top — see the listTenantApiKeys() call above), so a plain
  // max === 0 check is enough to gate self-service key creation now; no
  // separate tier lookup needed.
  const customKeysAllowed = apiKeyLimit.max === null || apiKeyLimit.max > 0;

  return (
    <div>
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
          lastUsedAt: usageByApiKeyId.get(k.apiKeyId)?.lastUsedAt ?? null,
          requestCount: usageByApiKeyId.get(k.apiKeyId)?.requestCount ?? 0,
          isManaged: k.isManaged,
          managedRole: k.managedRole,
          scopes: k.scopes,
        }))}
        canManage={canManage}
        missingKey={!hasActiveKey}
        environment={ctx.tenant.environment}
        apiBaseUrl={process.env.COMPROBIFY_API_URL ?? ''}
        callerScopes={computeApiScopesForRole(ctx.user.role)}
        activeKeyCount={apiKeyLimit.used}
        maxApiKeys={apiKeyLimit.max}
        customKeysAllowed={customKeysAllowed}
      />
    </div>
  );
}
