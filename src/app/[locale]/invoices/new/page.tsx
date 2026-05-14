import { setRequestLocale, getTranslations } from 'next-intl/server';
import { InvoiceForm } from '@/components/invoice-form';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/lib/context';
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
import type { SavedClient } from '@/app/actions/clients';

export interface InvoiceCatalogs {
  idTypes: CatalogIdType[];
  paymentMethods: CatalogPaymentMethod[];
  taxRates: CatalogTaxRate[];
  products: CatalogProduct[];
  clients: SavedClient[];
}

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceForm');

  const ctx = await requireContext();
  const { apiKey, tenant } = ctx;

  const [idTypes, paymentMethods, taxRates, productRows, clientRows] = await Promise.all([
    listCatalogIdTypes(apiKey),
    listCatalogPaymentMethods(apiKey),
    listCatalogTaxRates(apiKey),
    db.product.findMany({
      where: { tenantId: tenant.id },
      orderBy: { mainCode: 'asc' },
      select: { id: true, mainCode: true, auxCode: true, description: true, unitPrice: true, taxOption: true },
    }),
    db.client.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: 'asc' },
      select: { id: true, idType: true, idNumber: true, name: true, email: true, address: true },
    }),
  ]);

  const products: CatalogProduct[] = productRows.map((r) => ({
    ...r,
    unitPrice: r.unitPrice.toString(),
  }));

  const catalogs: InvoiceCatalogs = { idTypes, paymentMethods, taxRates, products, clients: clientRows };

  return (
    <div>
      <PageHeader title={t('title')} />
      <InvoiceForm catalogs={catalogs} />
    </div>
  );
}
