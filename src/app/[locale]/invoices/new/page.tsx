import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { InvoiceForm } from '@/components/invoice-form';
import { PageHeader } from '@/components/page-header';
import { requireApiKey } from '@/lib/auth-token';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  listCatalogIdTypes,
  listCatalogPaymentMethods,
  listCatalogTaxRates,
  type CatalogIdType,
  type CatalogPaymentMethod,
  type CatalogTaxRate,
} from '@/lib/api';
import type { CatalogProduct } from '@/app/actions/catalog';

export interface InvoiceCatalogs {
  idTypes: CatalogIdType[];
  paymentMethods: CatalogPaymentMethod[];
  taxRates: CatalogTaxRate[];
  products: CatalogProduct[];
}

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceForm');

  const [apiKey, session] = await Promise.all([requireApiKey(), auth()]);
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const [idTypes, paymentMethods, taxRates, productRows] = await Promise.all([
    listCatalogIdTypes(apiKey),
    listCatalogPaymentMethods(apiKey),
    listCatalogTaxRates(apiKey),
    userId
      ? db.product.findMany({
          where: { userId },
          orderBy: { mainCode: 'asc' },
          select: { id: true, mainCode: true, auxCode: true, description: true, unitPrice: true, taxOption: true },
        })
      : Promise.resolve([]),
  ]);

  const products: CatalogProduct[] = productRows.map((r) => ({
    ...r,
    unitPrice: r.unitPrice.toString(),
  }));

  const catalogs: InvoiceCatalogs = { idTypes, paymentMethods, taxRates, products };

  return (
    <div>
      <PageHeader title={t('title')} />
      <InvoiceForm catalogs={catalogs} />
    </div>
  );
}
