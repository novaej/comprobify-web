'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { reviewPaymentAction } from '@/app/actions/admin';
import { Eye, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminPayment, AdminPaymentProof } from '@/lib/admin-api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short' });

export function AdminPaymentManager({ payments: initialPayments }: { payments: AdminPayment[] }) {
  const t = useTranslations('admin.payments');
  const tError = useTranslations('apiError');
  const [payments, setPayments] = useState(initialPayments);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminPayment | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [proofTarget, setProofTarget] = useState<AdminPayment | null>(null);

  function removeFromQueue(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }

  function handleVerify(payment: AdminPayment) {
    const id = Number(payment.id);
    setPendingId(id);
    startTransition(async () => {
      const result = await reviewPaymentAction(id, 'VERIFIED');
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('verified'));
        removeFromQueue(payment.id);
      }
      setPendingId(null);
    });
  }

  function handleReject() {
    if (!rejectTarget || !rejectionReason.trim()) return;
    const id = Number(rejectTarget.id);
    setPendingId(id);
    startTransition(async () => {
      const result = await reviewPaymentAction(id, 'REJECTED', rejectionReason.trim());
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('rejected'));
        removeFromQueue(rejectTarget.id);
        setRejectTarget(null);
        setRejectionReason('');
      }
      setPendingId(null);
    });
  }

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <>
      <div className="space-y-3">
        {payments.map((payment) => {
          const id = Number(payment.id);
          const rowPending = isPending && pendingId === id;
          return (
            <div key={payment.id} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{payment.tenant?.email ?? `Tenant #${payment.tenant_id}`}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currencyFormatter.format(Number(payment.amount))}
                    {' · '}
                    {payment.tier}
                    {' · '}
                    {payment.purpose}
                  </p>
                  {payment.reported_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('reportedAt', { date: dateFormatter.format(new Date(payment.reported_at)) })}
                    </p>
                  )}
                  <Badge variant="outline" className="mt-2">
                    {payment.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setProofTarget(payment)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {t('viewProofs')}
                  </Button>
                  <Button size="sm" disabled={rowPending} onClick={() => handleVerify(payment)}>
                    {t('verify')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowPending}
                    onClick={() => {
                      setRejectTarget(payment);
                      setRejectionReason('');
                    }}
                  >
                    {t('reject')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectDialog.title')}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder={t('rejectDialog.placeholder')}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={isPending}>
              {t('rejectDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending || !rejectionReason.trim()}
            >
              {t('rejectDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {proofTarget && (
        <ProofViewerDialog
          payment={proofTarget}
          onClose={() => setProofTarget(null)}
        />
      )}
    </>
  );
}

function ProofViewerDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment;
  onClose: () => void;
}) {
  const t = useTranslations('admin.payments');
  const [proofs, setProofs] = useState<AdminPaymentProof[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Fetch proof list when dialog mounts.
  useEffect(() => {
    fetch(`/api/admin/payments/${payment.id}/proofs`)
      .then((r) => r.json())
      .then((data: { proofs?: AdminPaymentProof[] }) => {
        setProofs(data.proofs ?? []);
      })
      .catch(() => setLoadError(true));
  }, [payment.id]);

  const activeProof = proofs ? proofs[activeIndex] : null;
  const proofUrl = activeProof
    ? `/api/admin/payments/${payment.id}/proofs/${activeProof.id}?inline=1`
    : null;
  const downloadUrl = activeProof
    ? `/api/admin/payments/${payment.id}/proofs/${activeProof.id}`
    : null;

  const isImage = activeProof?.mimeType.startsWith('image/') ?? false;
  const isPdf = activeProof?.mimeType === 'application/pdf';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col sm:max-w-3xl h-[90vh] p-0 gap-0">
        <DialogHeader className="flex-row items-center gap-4 border-b border-border pl-6 pr-12 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-semibold truncate">
              {t('proofDialog.title')}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {payment.tenant?.email ?? `Tenant #${payment.tenant_id}`}
              {' · '}
              {currencyFormatter.format(Number(payment.amount))}
            </p>
          </div>
          {proofs && proofs.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((i) => i - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="text-xs text-muted-foreground">
                {activeIndex + 1} / {proofs.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={activeIndex === proofs.length - 1}
                onClick={() => setActiveIndex((i) => i + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={activeProof?.filename}
              className="shrink-0"
            >
              <Button size="sm" variant="outline" className="h-7">
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {t('proofDialog.download')}
              </Button>
            </a>
          )}
        </DialogHeader>

        <div className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-muted/30 p-4">
          {loadError && (
            <p className="text-sm text-destructive">{t('proofDialog.loadError')}</p>
          )}
          {proofs === null && !loadError && (
            <p className="text-sm text-muted-foreground">{t('proofDialog.loading')}</p>
          )}
          {proofs !== null && proofs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('proofDialog.noProofs')}</p>
          )}
          {proofUrl && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proofUrl}
              alt={activeProof?.filename}
              className="max-h-full max-w-full rounded object-contain shadow-sm"
            />
          )}
          {proofUrl && isPdf && (
            <iframe
              src={proofUrl}
              title={activeProof?.filename}
              className="h-full w-full rounded border-0"
            />
          )}
          {proofUrl && !isImage && !isPdf && (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">{t('proofDialog.unsupportedType')}</p>
              <a href={downloadUrl!} download={activeProof?.filename}>
                <Button variant="outline">
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('proofDialog.download')}
                </Button>
              </a>
            </div>
          )}
        </div>

        {activeProof && (
          <div className="shrink-0 border-t border-border px-6 py-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>{t('proofDialog.filename', { name: activeProof.filename })}</span>
            {activeProof.referenceNumber && (
              <span>{t('proofDialog.reference', { ref: activeProof.referenceNumber })}</span>
            )}
            {!activeProof.active && (
              <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                {t('proofDialog.deleted')}
              </Badge>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
