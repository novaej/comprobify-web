import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getDocument, getDocumentEvents, getSriResponses, listIssuerDocumentTypes } from '@/lib/api';
import { requirePermission } from '@/lib/context';
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
import { BACK_TARGETS, isBackTargetKey, type BackTargetKey } from '@/lib/back-targets';
import { describeDocumentEvent } from '@/lib/event-description';

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

  const ctx = await requirePermission('documents.read');
  const canManage = ctx.permissions.has('documents.manage');
  const canCreate = ctx.permissions.has('documents.create');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };

  let document;
  let events;
  let sriResponses;
  try {
    [document, events, sriResponses] = await Promise.all([
      getDocument(apiCtx, key),
      getDocumentEvents(apiCtx, key),
      getSriResponses(apiCtx, key),
    ]);
  } catch (err) {
    // key is the only param this call validates, so VALIDATION_FAILED here
    // always means a malformed access key — treat it the same as not found.
    if (err instanceof ApiError && (err.isNotFound() || err.isValidation())) {
      notFound();
    }
    throw err;
  }

  // Gates "Crear nota de crédito" — POST /v1/documents checks the ISSUER's
  // actually-enabled document types at creation time (DOCUMENT_TYPE_NOT_ENABLED
  // otherwise), which is itself capped by the tenant's tier (a FREE-plan issuer
  // can never have '04' enabled) — so this is the one source of truth for both
  // "the plan doesn't allow it" and "this issuer just never enabled it," rather
  // than re-deriving the same answer from the tier's allowedDocumentTypes.
  const issuerDocumentTypes = await listIssuerDocumentTypes(apiCtx, ctx.issuer.apiIssuerId).catch(() => ['01']);

  const rejectionMessages = (document.status === 'RETURNED' || document.status === 'NOT_AUTHORIZED')
    ? sriResponses.flatMap((r) => r.messages ?? []).filter((m) => m.message)
    : [];

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

      {/* SRI rejection reasons */}
      {rejectionMessages.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-destructive">
            {t('sriRejection.title')}
          </h2>
          <ul className="space-y-2">
            {rejectionMessages.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-destructive/80">
                  {m.identifier ? `[${m.identifier}] ` : ''}
                </span>
                <span>{m.message}</span>
                {m.additionalInfo && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    — {m.additionalInfo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Polling banner */}
      {document.status === 'RECEIVED' && (
        <InvoicePolling accessKey={document.accessKey} />
      )}

      {/* Action buttons (includes inline PDF preview toggle for AUTHORIZED) */}
      <InvoiceActions
        accessKey={document.accessKey}
        status={document.status}
        documentType={document.documentType}
        from={backTargetKey}
        canManage={canManage}
        canCreate={canCreate}
        issuerDocumentTypes={issuerDocumentTypes}
      />

      {/* Events timeline */}
      {events.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t('events.title')}</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('events.type')}
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('events.from')}
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground"></TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('events.to')}
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
                {events.map((event) => {
                  const desc = describeDocumentEvent(event, t);
                  const isAuthorizationNumber = event.eventType === 'STATUS_CHANGED' && desc.detail && event.toStatus === 'AUTHORIZED';
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="pl-4 text-sm font-medium">{desc.title}</TableCell>
                      <TableCell>
                        {desc.transition?.from ? <StatusBadge status={desc.transition.from} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="px-0">
                        {desc.transition && desc.transition.from && desc.transition.to && (
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        {desc.transition?.to ? <StatusBadge status={desc.transition.to} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString('es-EC')}
                      </TableCell>
                      <TableCell className="pr-4 text-xs text-muted-foreground">
                        {desc.detail ? (
                          isAuthorizationNumber ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono break-all">{desc.detail}</span>
                              <AccessKeyCopy value={desc.detail} />
                            </div>
                          ) : (
                            desc.detail
                          )
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
