import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { InvoiceForm } from '@/components/invoice-form';
import { PageHeader } from '@/components/page-header';

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceForm');

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} />
      <InvoiceForm />
    </div>
  );
}
