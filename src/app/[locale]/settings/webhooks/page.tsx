import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { WebhookManager } from '@/components/webhook-manager';
import { getCanonicalWebhookUrl, isPubliclyReachableHttpsUrl } from '@/lib/webhook-url';
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

  const endpoints = await db.webhookEndpoint.findMany({
    where: { tenantId: ctx.tenant.id, active: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, url: true, eventTypes: true, active: true, createdAt: true },
  });

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
      />
    </div>
  );
}
