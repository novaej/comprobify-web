import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getDocument } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceDetail');

  let document;
  try {
    document = await getDocument(key);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound()) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-mono">
            {t('accessKey')}: {document.accessKey}
          </p>
          <h1 className="text-2xl font-bold mt-1">
            {t('sequential')}: {document.sequential}
          </h1>
        </div>
        <StatusBadge status={document.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">{t('issueDate')}</p>
          <p className="font-medium">{document.issueDate}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('total')}</p>
          <p className="font-medium">${document.total}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('buyer')}</p>
          <p className="font-medium">{document.buyer.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('buyerId')}</p>
          <p className="font-medium">{document.buyer.id}</p>
        </div>
      </div>

      {/* TODO Phase 3: Contextual action buttons based on status */}
      {/* TODO Phase 3: Line items table */}
      {/* TODO Phase 3: Events timeline */}
      {/* TODO Phase 3: TanStack Query polling when status === RECEIVED */}
      <p className="text-sm text-muted-foreground">
        Vista detalle en construcción — agrega acciones contextuales y timeline de eventos.
      </p>
    </div>
  );
}
