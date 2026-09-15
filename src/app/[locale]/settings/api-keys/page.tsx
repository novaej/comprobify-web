import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { ApiKeyManager } from '@/components/api-key-manager';
import { listTenantApiKeys, getCurrentTenant } from '@/lib/api';
import { listTiers } from '@/lib/public-api';
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

  const [keys, { keys: apiKeyInfos, limit: apiKeyLimit }, tenantInfo, { tiers }] = await Promise.all([
    db.tenantApiKey.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: 'desc' },
    }),
    // Lifetime lastUsedAt/requestCount live only on the API side — the local
    // TenantApiKey mirror has no columns for them. `limit` (max already
    // includes comprobify's reservedForFrontend.apiKeys allowance, ADR-034)
    // is the same ceiling resolveTenantLimits() would otherwise have to
    // re-fetch, so it's read directly from here instead.
    listTenantApiKeys({ apiKey: ctx.apiKey }),
    getCurrentTenant({ apiKey: ctx.apiKey }),
    listTiers(),
  ]);

  const usageByApiKeyId = new Map(apiKeyInfos.map((info) => [info.id, info]));
  const canManage = ctx.permissions.has('apikeys.manage');
  const hasActiveKey = keys.some((k) => k.isActive);

  // apiKeyLimit.max already folds in reservedForFrontend.apiKeys (5 slots for
  // comprobify-web's own master/per-role keys, ADR-034), so a FREE/SOLO/LITE
  // tenant (0 self-service keys) with only its master key active shows
  // used(1) < max(5) and would otherwise be free to spend the remaining
  // reserved headroom on self-service keys of their own — the same class of
  // gap as the webhook reserved-slot issue. Gate self-service key creation on
  // the tier's own raw allowance instead, independent of that headroom.
  const currentTier = tiers.find((tier) => tier.name === tenantInfo.subscriptionTier);
  const customKeysAllowed = currentTier
    ? currentTier.maxApiKeys === null || currentTier.maxApiKeys > 0
    : false;

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
