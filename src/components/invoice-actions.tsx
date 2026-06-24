'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
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
import { sendToSriAction, tryAuthorizeAction, resendEmailAction } from '@/app/actions/document';
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
}

// Document types whose "Corregir" link goes through /credit-notes/new instead of
// /invoices/new — every other type (today, just invoices) uses the invoice form.
const REBUILD_HREFS: Record<string, string> = {
  '04': '/credit-notes/new',
};

export function InvoiceActions({ accessKey, status, documentType, from }: InvoiceActionsProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [resendPending, startResendTransition] = useTransition();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When router.refresh() delivers a new status prop, stop any in-flight processing.
  useEffect(() => {
    if (status !== 'SIGNED' && phase !== 'idle') {
      setPhase('idle');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [status, phase]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function handleSend() {
    setConfirmOpen(false);
    setPhase('sending');

    const result = await sendToSriAction(accessKey);
    if ('error' in result) {
      setPhase('idle');
      toastApiError(result.error, tError);
      return;
    }

    if (result.status !== 'RECEIVED') {
      router.refresh();
      return;
    }

    setPhase('polling');
    const startedAt = Date.now();
    pollIntervalRef.current = setInterval(async () => {
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        setPhase('idle');
        router.refresh();
        return;
      }
      const pollResult = await tryAuthorizeAction(accessKey);
      if ('status' in pollResult && pollResult.status !== 'RECEIVED') {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
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
          {status === 'SIGNED' && (
            <Button onClick={() => setConfirmOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              {t('actions.send')}
            </Button>
          )}

          {(status === 'RETURNED' || status === 'NOT_AUTHORIZED') && (
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
                  <DropdownMenuItem disabled={resendPending} onClick={handleResendEmail}>
                    <Mail className="h-4 w-4" />
                    {t('actions.resendEmail')}
                  </DropdownMenuItem>
                  {documentType === '01' && (
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
