'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, Download, Mail, Loader2, Hammer, FileMinus, MoreVertical, Eye, EyeOff } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { sendToSriAction, getDocumentStatusAction, resendEmailAction } from '@/app/actions/document';
import type { DocumentStatus } from '@/lib/api';
import { toastApiError } from '@/lib/api-error-toast';
import { Link, useRouter } from '@/i18n/navigation';
import { InvoicePdfPreview } from '@/components/invoice-pdf-preview-lazy';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 2 * 60 * 1_000;

type Phase = 'idle' | 'sending' | 'polling';

interface InvoiceActionsProps {
  accessKey: string;
  status: DocumentStatus;
  documentType: string;
  from?: string;
  canManage?: boolean;
  canCreate?: boolean;
}

// Document types whose "Corregir" link goes through /credit-notes/new instead of
// /invoices/new — every other type (today, just invoices) uses the invoice form.
const REBUILD_HREFS: Record<string, string> = {
  '04': '/credit-notes/new',
};

export function InvoiceActions({ accessKey, status, documentType, from, canManage = true, canCreate = true }: InvoiceActionsProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [resendPending, startResendTransition] = useTransition();

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
        setPhase('idle');
        router.refresh();
        return;
      }
      const pollResult = await getDocumentStatusAction(accessKey);
      if ('status' in pollResult && pollResult.status !== 'PENDING_SEND') {
        clearInterval(interval);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, accessKey, router]);

  // Once router.refresh() delivers a status that isn't PENDING_SEND anymore
  // (RECEIVED/RETURNED), drop back to idle so the buttons for the new status render.
  useEffect(() => {
    if (status !== 'PENDING_SEND' && phase === 'polling') {
      setPhase('idle');
    }
  }, [status, phase]);

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

  const isProcessing = phase !== 'idle';

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

      {isProcessing ? (
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

          {status === 'AUTHORIZED' && (
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
                  {canManage && (
                    <DropdownMenuItem disabled={resendPending} onClick={handleResendEmail}>
                      <Mail className="h-4 w-4" />
                      {t('actions.resendEmail')}
                    </DropdownMenuItem>
                  )}
                  {documentType === '01' && canCreate && (
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
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {status === 'AUTHORIZED' && previewOpen && (
          <div className="mt-3">
            <InvoicePdfPreview accessKey={accessKey} />
          </div>
        )}
        </>
      )}
    </>
  );
}
