import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { InvoiceForm } from '@/components/invoice-form';
import { PageHeader } from '@/components/page-header';
import { requireApiKey } from '@/lib/auth-token';
import {
  listCatalogIdTypes,
  listCatalogPaymentMethods,
  listCatalogTaxRates,
  type CatalogIdType,
  type CatalogPaymentMethod,
  type CatalogTaxRate,
} from '@/lib/api';

export interface InvoiceCatalogs {
  idTypes: CatalogIdType[];
  paymentMethods: CatalogPaymentMethod[];
  taxRates: CatalogTaxRate[];
}

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceForm');

  const apiKey = await requireApiKey();
  const [idTypes, paymentMethods, taxRates] = await Promise.all([
    listCatalogIdTypes(apiKey),
    listCatalogPaymentMethods(apiKey),
    listCatalogTaxRates(apiKey),
  ]);

  const catalogs: InvoiceCatalogs = { idTypes, paymentMethods, taxRates };

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} />
      <InvoiceForm catalogs={catalogs} />
    </div>
  );
}
