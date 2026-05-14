import { setRequestLocale, getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/context';
import { ClientCatalog } from '@/components/client-catalog';
import { PageHeader } from '@/components/page-header';
import type { SavedClient } from '@/app/actions/clients';

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('clients');
  const ctx = await requireContext({ skipIssuer: true });

  const clients: SavedClient[] = await db.client.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { name: 'asc' },
    select: { id: true, idType: true, idNumber: true, name: true, email: true, address: true },
  });

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ClientCatalog initialClients={clients} />
    </div>
  );
}
