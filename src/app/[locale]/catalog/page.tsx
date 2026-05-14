import { setRequestLocale, getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/context';
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

  const t = await getTranslations('catalog');
  const ctx = await requireContext({ skipIssuer: true });

  const rows = await db.product.findMany({
    where: { tenantId: ctx.tenant.id },
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
