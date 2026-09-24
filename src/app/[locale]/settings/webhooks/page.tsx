import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { WebhookManager } from '@/components/webhook-manager';
import { getCanonicalWebhookUrl, isPubliclyReachableHttpsUrl } from '@/lib/webhook-url';
import { listWebhookEndpoints, getCurrentTenant } from '@/lib/api';
import { reconcileTenantStatus } from '@/lib/tenant-status-sync';
import type { CanonicalAvailability } from '@/components/webhook-manager';

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('webhooks');
  const tSettings = await getTranslations('settings');

  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  const [endpoints, { limit }, tenantInfo] = await Promise.all([
    db.webhookEndpoint.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, eventTypes: true, active: true, createdAt: true },
    }),
    // The API's own count/limit — the tenant's own self-service pool.
    // comprobify-web's canonical webhook is minted through the admin-gated
    // path and excluded entirely (comprobify migration 102, no more
    // reserved-slot padding on top of the tier's own maxWebhookEndpoints),
    // so this is the authoritative source for what the plan actually allows.
    listWebhookEndpoints({ apiKey: ctx.apiKey }),
    // Registering a custom endpoint requires a verified email (comprobify
    // c75d7f9). Read live and fail open — the API stays the real gate.
    getCurrentTenant({ apiKey: ctx.apiKey }).catch(() => null),
  ]);
  const emailVerified = tenantInfo ? tenantInfo.status !== 'PENDING_VERIFICATION' : true;
  if (tenantInfo) await reconcileTenantStatus(ctx.tenant.id, ctx.tenant.status, tenantInfo.status);

  // limit.max is the tier's own raw maxWebhookEndpoints (a plain passthrough
  // as of comprobify migration 102), so a plain max === 0 check is enough to
  // gate the custom-webhook form now; no separate tier lookup needed.
  const customWebhooksAllowed = limit.max === null || limit.max > 0;

  const canonicalUrl = getCanonicalWebhookUrl();
  const canonicalAvailability: CanonicalAvailability =
    canonicalUrl === null
      ? 'not_configured'
      : isPubliclyReachableHttpsUrl(canonicalUrl)
        ? 'available'
        : 'invalid_url';
  const canonicalEndpoint = canonicalUrl ? endpoints.find((e) => e.url === canonicalUrl) ?? null : null;
  const customEndpoints = endpoints.filter((e) => e.id !== canonicalEndpoint?.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} description={t('description')} backHref="/settings" backLabel={tSettings('title')} />
      <WebhookManager
        canonicalAvailability={canonicalAvailability}
        canonicalEndpointId={canonicalEndpoint?.id ?? null}
        endpoints={customEndpoints.map((e) => ({
          id: e.id,
          url: e.url,
          eventTypes: e.eventTypes,
          active: e.active,
          createdAt: e.createdAt.toISOString(),
        }))}
        usedEndpoints={limit.used}
        maxEndpoints={limit.max}
        customWebhooksAllowed={customWebhooksAllowed}
        emailVerified={emailVerified}
      />
    </div>
  );
}
