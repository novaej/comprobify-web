import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { db } from '@/lib/db';
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

  const session = await auth();
  if (!session?.user?.id) redirect({ href: '/login', locale });

  const t = await getTranslations('clients');

  const rows = await db.client.findMany({
    where: { userId: Number(session!.user.id) },
    orderBy: { name: 'asc' },
    select: { id: true, idType: true, idNumber: true, name: true, email: true, address: true },
  });

  const clients: SavedClient[] = rows;

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ClientCatalog initialClients={clients} />
    </div>
  );
}
