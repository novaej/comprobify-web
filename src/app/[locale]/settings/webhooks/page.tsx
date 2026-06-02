import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { WebhookManager } from '@/components/webhook-manager';

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('webhooks');

  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  const endpoints = await db.webhookEndpoint.findMany({
    where: { tenantId: ctx.tenant.id, active: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, url: true, eventTypes: true, active: true, createdAt: true },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('title')} description={t('description')} />
      <WebhookManager
        endpoints={endpoints.map((e) => ({
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
