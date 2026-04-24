import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getDocument, getDocumentEvents } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { InvoiceActions } from '@/components/invoice-actions';
import { InvoicePolling } from '@/components/invoice-polling';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccessKeyCopy } from '@/components/access-key-copy';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceDetail');

  let document;
  let events;
  try {
    [document, events] = await Promise.all([
      getDocument(key),
      getDocumentEvents(key),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound()) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground font-mono">
            <span className="shrink-0">{t('accessKey')}:</span>
            <span className="break-all">{document.accessKey}</span>
            <AccessKeyCopy value={document.accessKey} />
          </div>
          <h1 className="text-2xl font-bold mt-1">
            {t('sequential')}: {document.sequential}
          </h1>
        </div>
        <StatusBadge status={document.status} />
      </div>

      {/* Key info */}
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
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

      {/* Authorization info */}
      {document.authorizationNumber && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t('authorizationNumber')}</p>
            <p className="font-mono text-xs break-all">{document.authorizationNumber}</p>
          </div>
          {document.authorizationDate && (
            <div>
              <p className="text-muted-foreground">{t('authorizationDate')}</p>
              <p className="font-medium">{document.authorizationDate}</p>
            </div>
          )}
        </div>
      )}

      {/* Polling banner */}
      {document.status === 'RECEIVED' && (
        <InvoicePolling accessKey={document.accessKey} />
      )}

      {/* Action buttons */}
      <InvoiceActions accessKey={document.accessKey} status={document.status} />

      {/* Events timeline */}
      {events.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">{t('events.title')}</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('events.type')}</TableHead>
                  <TableHead>{t('events.date')}</TableHead>
                  <TableHead>{t('events.detail')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {t.has(`eventTypes.${event.eventType}` as Parameters<typeof t>[0])
                        ? t(`eventTypes.${event.eventType}` as Parameters<typeof t>[0])
                        : event.eventType}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString('es-EC')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{event.detail ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('events.empty')}</p>
      )}
    </div>
  );
}
