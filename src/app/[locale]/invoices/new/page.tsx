import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

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

      {/* TODO Phase 3: InvoiceForm component (react-hook-form + zod) */}
      {/* Sections: Buyer → Line items → Payment → Totals preview → Submit */}
      <p className="text-sm text-muted-foreground">
        Formulario de factura en construcción.
      </p>
    </div>
  );
}
