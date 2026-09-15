import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { WebhookManager } from '@/components/webhook-manager';
import { getCanonicalWebhookUrl, isPubliclyReachableHttpsUrl } from '@/lib/webhook-url';
import { listWebhookEndpoints, getCurrentTenant } from '@/lib/api';
import { listTiers } from '@/lib/public-api';
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

  const [endpoints, { limit }, tenantInfo, { tiers }] = await Promise.all([
    db.webhookEndpoint.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, eventTypes: true, active: true, createdAt: true },
    }),
    // The API's own count/limit (used already includes comprobify-web's
    // reserved canonical-webhook slot) — the authoritative source for what
    // the tenant's plan actually allows, see listWebhookEndpoints' comment.
    listWebhookEndpoints({ apiKey: ctx.apiKey }),
    getCurrentTenant({ apiKey: ctx.apiKey }),
    listTiers(),
  ]);

  // limit.max already folds in the reserved-for-frontend canonical-webhook
  // slot (ADR-034), so a FREE/SOLO/LITE tenant (0 self-service webhooks) who
  // hasn't activated the canonical webhook yet — or can't, e.g. on localhost
  // where NEXT_PUBLIC_APP_URL fails the HTTPS check, see webhook-url.ts —
  // still shows used < max and would otherwise be free to spend that
  // reserved slot on a custom webhook of their own. Gate the custom-webhook
  // form on the tier's own raw allowance instead, independent of whether the
  // reserved slot happens to be free right now.
  const currentTier = tiers.find((tier) => tier.name === tenantInfo.subscriptionTier);
  const customWebhooksAllowed = currentTier ? currentTier.maxWebhookEndpoints > 0 : false;

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
      />
    </div>
  );
}
