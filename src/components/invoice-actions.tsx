'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, Download, Mail, Loader2, Hammer, FileMinus, FileX, MoreVertical, Eye, EyeOff } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sendToSriAction, getDocumentStatusAction, resendEmailAction, retrySendAction, voidDocumentAction } from '@/app/actions/document';
import type { DocumentStatus, DocumentDispatchStatus } from '@/lib/api';
import { toastApiError } from '@/lib/api-error-toast';
import { Link, useRouter } from '@/i18n/navigation';
import { InvoicePdfPreview } from '@/components/invoice-pdf-preview-lazy';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 2 * 60 * 1_000;

type Phase = 'idle' | 'sending' | 'polling' | 'timedOut';

interface InvoiceActionsProps {
  accessKey: string;
  status: DocumentStatus;
  documentType: string;
  from?: string;
  canManage?: boolean;
  canCreate?: boolean;
  // Document types actually enabled on the issuer that created this document
  // (GET /v1/issuers/:id/document-types) — itself capped by the tenant's tier,
  // since an issuer can never have a type enabled that its plan doesn't allow.
  // Gates "Crear nota de crédito" so a FREE/lower-tier tenant (or an issuer
  // that simply never enabled '04') never sees an action that would just fail
  // with DOCUMENT_TYPE_NOT_ENABLED.
  issuerDocumentTypes?: string[];
}

// Document types whose "Corregir" link goes through /credit-notes/new instead of
// /invoices/new — every other type (today, just invoices) uses the invoice form.
const REBUILD_HREFS: Record<string, string> = {
  '04': '/credit-notes/new',
};

export function InvoiceActions({ accessKey, status, documentType, from, canManage = true, canCreate = true, issuerDocumentTypes = ['01'] }: InvoiceActionsProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [resendPending, startResendTransition] = useTransition();
  const [retryPending, startRetryTransition] = useTransition();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirmed, setVoidConfirmed] = useState(false);
  const [voidPending, startVoidTransition] = useTransition();
  // Bumped to restart the polling effect below from a fresh clock — either
  // after a successful manual retry, or after deciding to just wait longer —
  // even though `status` itself hasn't changed (still PENDING_SEND).
  const [pollGeneration, setPollGeneration] = useState(0);
  // Latest known dispatch info from the polling loop below, read (not reacted
  // to) by handleRetry to decide what a click should actually do. A ref, not
  // state, since updating it on every 5s tick shouldn't itself re-render.
  const dispatchRef = useRef<DocumentDispatchStatus | undefined>(undefined);

  // Auto-resumes polling whenever the document is (or becomes) PENDING_SEND —
  // covers a manual send below, the best-effort send-after-signing on creation
  // (invoice.ts's sendAfterSigningIfRequested), and revisiting a page that's
  // still waiting on the RabbitMQ worker from an earlier session (see ADR-019).
  useEffect(() => {
    if (status !== 'PENDING_SEND') return;
    setPhase('polling');
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        clearInterval(interval);
        setPhase('timedOut');
        return;
      }
      try {
        const pollResult = await getDocumentStatusAction(accessKey);
        if ('status' in pollResult) {
          dispatchRef.current = pollResult.dispatch;
          if (pollResult.status !== 'PENDING_SEND') {
            clearInterval(interval);
            router.refresh();
          }
        }
      } catch {
        // transient network blip; next tick retries until TIMEOUT_MS
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, accessKey, router, pollGeneration]);

  // Once router.refresh() delivers a status that isn't PENDING_SEND anymore
  // (RECEIVED/RETURNED), drop back to idle so the buttons for the new status render.
  useEffect(() => {
    if (status !== 'PENDING_SEND' && (phase === 'polling' || phase === 'timedOut')) {
      setPhase('idle');
    }
  }, [status, phase]);

  // A single "Reintentar" click means two different things depending on what
  // the last poll saw: if the automatic send attempt is still PENDING/
  // DISPATCHED (most likely — reconciliation spaces attempts 5 min apart, far
  // longer than this 2-minute frontend timeout), calling the retry endpoint
  // would just 409 NOTHING_TO_RETRY, so instead this purely restarts the local
  // poll for another 2 minutes, giving the backend more time — no server call
  // beyond the same GET it already does every 5s. Only once dispatch.status is
  // actually FAILED does this call retrySendAction (POST .../send/retry).
  function handleRetry() {
    startRetryTransition(async () => {
      if (dispatchRef.current?.status === 'FAILED') {
        const result = await retrySendAction(accessKey);
        if ('error' in result) {
          toastApiError(result.error, tError);
          return;
        }
      }
      setPollGeneration((g) => g + 1);
    });
  }

  async function handleSend() {
    setConfirmOpen(false);
    setPhase('sending');

    const result = await sendToSriAction(accessKey);
    if ('error' in result) {
      setPhase('idle');
      toastApiError(result.error, tError);
      return;
    }

    // Always PENDING_SEND now (see ADR-019) — router.refresh() delivers that
    // status prop, which the effect above picks up to start polling.
    router.refresh();
  }

  function handleResendEmail() {
    startResendTransition(async () => {
      const result = await resendEmailAction(accessKey);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('actions.resendEmailSuccess'));
      }
    });
  }

  function handleVoid() {
    startVoidTransition(async () => {
      const result = await voidDocumentAction(accessKey, voidReason.trim());
      if (result?.error) {
        toastApiError(result.error, tError);
        return;
      }
      setVoidOpen(false);
      setVoidReason('');
      setVoidConfirmed(false);
      toast.success(t('actions.voidSuccess'));
      router.refresh();
    });
  }

  const isProcessing = phase === 'sending' || phase === 'polling';

  return (
    <>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('actions.confirm.title')}</DialogTitle>
            <DialogDescription>{t('actions.confirm.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('actions.confirm.cancel')}
            </DialogClose>
            <Button onClick={handleSend}>
              <Send className="mr-2 h-4 w-4" />
              {t('actions.confirm.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={(open) => { setVoidOpen(open); if (!open) { setVoidReason(''); setVoidConfirmed(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('voidDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300">
              {t('voidDialog.sriFirstWarning')}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="void-reason" className="text-xs font-medium text-muted-foreground">
                {t('voidDialog.reasonLabel')}
              </label>
              <Textarea
                id="void-reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                maxLength={500}
                placeholder={t('voidDialog.reasonPlaceholder')}
                disabled={voidPending}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                checked={voidConfirmed}
                onChange={(e) => setVoidConfirmed(e.target.checked)}
                disabled={voidPending}
              />
              {t('voidDialog.confirmCheckboxLabel')}
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={voidPending} />}>
              {t('voidDialog.cancel')}
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleVoid}
              disabled={voidPending || !voidReason.trim() || !voidConfirmed}
            >
              {voidPending ? t('voidDialog.submitting') : t('voidDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {phase === 'timedOut' ? (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
          <p className="flex-1">{t('polling.timeout')}</p>
          <Button size="sm" variant="outline" disabled={retryPending} onClick={handleRetry}>
            {retryPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {t('actions.retry')}
          </Button>
        </div>
      ) : isProcessing ? (
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase === 'sending' ? t('actions.sending') : t('polling.waiting')}
        </div>
      ) : (
        <>
        <div className="flex flex-wrap gap-2">
          {status === 'SIGNED' && canManage && (
            <Button onClick={() => setConfirmOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              {t('actions.send')}
            </Button>
          )}

          {(status === 'RETURNED' || status === 'NOT_AUTHORIZED') && canManage && (
            <Link
              href={(() => {
                const base = REBUILD_HREFS[documentType] ?? '/invoices/new';
                return from ? `${base}?rebuild=${accessKey}&from=${from}` : `${base}?rebuild=${accessKey}`;
              })()}
              className={buttonVariants({})}
            >
              <Hammer className="mr-2 h-4 w-4" />
              {t('actions.rebuild')}
            </Link>
          )}

          {/* RIDE/XML preview stays available for a voided document too — it's the
              frozen record of what SRI actually authorized before voiding. Resending
              the email, crediting, or voiding again don't make sense once voided, so
              those stay AUTHORIZED-only below. */}
          {(status === 'AUTHORIZED' || status === 'VOIDED') && (
            <>
              <Button onClick={() => setPreviewOpen((v) => !v)}>
                {previewOpen ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {t('pdfPreview.toggleLabel')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={t('actions.moreActions')} />}>
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem render={<a href={`/api/documents/${accessKey}/xml`} download />}>
                    <Download className="h-4 w-4" />
                    {t('actions.downloadXml')}
                  </DropdownMenuItem>
                  {status === 'AUTHORIZED' && canManage && (
                    <DropdownMenuItem disabled={resendPending} onClick={handleResendEmail}>
                      <Mail className="h-4 w-4" />
                      {t('actions.resendEmail')}
                    </DropdownMenuItem>
                  )}
                  {status === 'AUTHORIZED' && documentType === '01' && canCreate && issuerDocumentTypes.includes('04') && (
                    <DropdownMenuItem
                      render={
                        <Link
                          href={from ? `/credit-notes/new?fromInvoice=${accessKey}&from=${from}` : `/credit-notes/new?fromInvoice=${accessKey}`}
                        />
                      }
                    >
                      <FileMinus className="h-4 w-4" />
                      {t('actions.createCreditNote')}
                    </DropdownMenuItem>
                  )}
                  {status === 'AUTHORIZED' && canManage && (
                    <DropdownMenuItem variant="destructive" onClick={() => setVoidOpen(true)}>
                      <FileX className="h-4 w-4" />
                      {t('actions.void')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {(status === 'AUTHORIZED' || status === 'VOIDED') && previewOpen && (
          <div className="mt-3">
            <InvoicePdfPreview accessKey={accessKey} />
          </div>
        )}
        </>
      )}
    </>
  );
}
