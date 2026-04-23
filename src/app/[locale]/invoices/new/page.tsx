import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { InvoiceForm } from '@/components/invoice-form';

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceForm');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <InvoiceForm />
    </div>
  );
}
