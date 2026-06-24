import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getDocument, getDocumentEvents } from '@/lib/api';
import { requireContext } from '@/lib/context';
import { ApiError } from '@/lib/errors';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { InvoiceActions } from '@/components/invoice-actions';
import { InvoicePolling } from '@/components/invoice-polling';
import { InvoicePdfPreviewToggle } from '@/components/invoice-pdf-preview-toggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccessKeyCopy } from '@/components/access-key-copy';
import { BACK_TARGETS, isBackTargetKey, type BackTargetKey } from '@/lib/back-targets';
import type { DocumentEvent } from '@/lib/api';

function formatEventDetail(detail: DocumentEvent['detail']): string {
  if (!detail || Object.keys(detail).length === 0) return '—';
  if (typeof detail.message === 'string') return detail.message;
  if (typeof detail.error === 'string') return detail.error;
  if (typeof detail.to === 'string') return detail.to;
  if (typeof detail.authorizationNumber === 'string') return detail.authorizationNumber;
  if (typeof detail.sriStatus === 'string') return detail.sriStatus;
  if (typeof detail.accessKey === 'string') return detail.accessKey;
  return JSON.stringify(detail);
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; key: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale, key } = await params;
  const { from } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('invoiceDetail');

  const tDashboard = await getTranslations('dashboard');
  const tDocuments = await getTranslations('documents');

  const backTargetKey: BackTargetKey = isBackTargetKey(from) ? from : 'dashboard';
  const backTarget = BACK_TARGETS[backTargetKey];
  const tBack = backTarget.namespace === 'documents' ? tDocuments : tDashboard;
  const backLabel = tBack(backTarget.key as Parameters<typeof tBack>[0]);

  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  let document;
  let events;
  try {
    [document, events] = await Promise.all([
      getDocument(apiCtx, key),
      getDocumentEvents(apiCtx, key),
    ]);
  } catch (err) {
    // key is the only param this call validates, so VALIDATION_FAILED here
    // always means a malformed access key — treat it the same as not found.
    if (err instanceof ApiError && (err.isNotFound() || err.isValidation())) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-5">
      <Link
        href={backTarget.href}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">
            {t('sequential')}: {document.sequential}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="shrink-0">{t('accessKey')}:</span>
            <span className="break-all">{document.accessKey}</span>
            <AccessKeyCopy value={document.accessKey} />
          </div>
        </div>
        <div className="shrink-0 mt-0.5">
          <StatusBadge status={document.status} />
        </div>
      </div>

      {/* Key info */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('issueDate')}
            </dt>
            <dd className="mt-1 font-medium">{document.issueDate}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('total')}
            </dt>
            <dd className="mt-1 font-semibold">${document.total}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('buyer')}
            </dt>
            <dd className="mt-1 font-medium">{document.buyer.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('buyerId')}
            </dt>
            <dd className="mt-1 font-medium">{document.buyer.id}</dd>
          </div>
        </dl>
      </div>

      {/* Authorization info */}
      {document.authorizationNumber && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('authorizationNumber')}
              </dt>
              <dd className="mt-1 font-mono text-xs break-all">{document.authorizationNumber}</dd>
            </div>
            {document.authorizationDate && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('authorizationDate')}
                </dt>
                <dd className="mt-1 font-medium">{document.authorizationDate}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Polling banner */}
      {document.status === 'RECEIVED' && (
        <InvoicePolling accessKey={document.accessKey} />
      )}

      {/* Action buttons */}
      <InvoiceActions
        accessKey={document.accessKey}
        status={document.status}
        documentType={document.documentType}
        from={backTargetKey}
      />

      {/* PDF preview */}
      {document.status === 'AUTHORIZED' && (
        <InvoicePdfPreviewToggle accessKey={document.accessKey} />
      )}

      {/* Events timeline */}
      {events.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t('events.title')}</h2>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('events.type')}
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('events.date')}
                  </TableHead>
                  <TableHead className="pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('events.detail')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="pl-4 text-sm">
                      {t.has(`eventTypes.${event.eventType}` as Parameters<typeof t>[0])
                        ? t(`eventTypes.${event.eventType}` as Parameters<typeof t>[0])
                        : event.eventType}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString('es-EC')}
                    </TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground">
                      {formatEventDetail(event.detail)}
                    </TableCell>
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
