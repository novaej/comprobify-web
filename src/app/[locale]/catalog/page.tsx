import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { ProductCatalog } from '@/components/product-catalog';
import { PageHeader } from '@/components/page-header';
import type { CatalogProduct } from '@/app/actions/catalog';

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect({ href: '/login', locale });

  const t = await getTranslations('catalog');

  const rows = await db.product.findMany({
    where: { userId: Number(session!.user.id) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, mainCode: true, auxCode: true, description: true, unitPrice: true, taxOption: true },
  });

  const products: CatalogProduct[] = rows.map((r) => ({
    ...r,
    unitPrice: r.unitPrice.toString(),
  }));

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ProductCatalog initialProducts={products} />
    </div>
  );
}
