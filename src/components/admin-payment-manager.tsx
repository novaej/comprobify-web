'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
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
import { reviewPaymentAction, refundPaymentAction } from '@/app/actions/admin';
import { Eye, Download, ChevronLeft, ChevronRight, ExternalLink, Undo2, MoreVertical, CreditCard } from 'lucide-react';
import type { AdminPayment, AdminPaymentProof } from '@/lib/admin-api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short' });

export function AdminPaymentManager({
  payments: initialPayments,
  tenantNames,
  reviewable,
}: {
  payments: AdminPayment[];
  tenantNames: Record<string, string>;
  reviewable: boolean;
}) {
  const t = useTranslations('admin.payments');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [payments, setPayments] = useState(initialPayments);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminPayment | null>(null);
  const [rejectionReasonCode, setRejectionReasonCode] = useState('');
  const [proofTarget, setProofTarget] = useState<AdminPayment | null>(null);
  const [previewAccessKey, setPreviewAccessKey] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminPayment | null>(null);
  const [refundReason, setRefundReason] = useState('');

  function removeFromQueue(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }

  function handleVerify(payment: AdminPayment) {
    const id = payment.id;
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
    if (!rejectTarget || !rejectionReasonCode) return;
    const id = rejectTarget.id;
    setPendingId(id);
    startTransition(async () => {
      const result = await reviewPaymentAction(id, 'REJECTED', rejectionReasonCode);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('rejected'));
        removeFromQueue(rejectTarget.id);
        setRejectTarget(null);
        setRejectionReasonCode('');
      }
      setPendingId(null);
    });
  }

  function handleRefund() {
    if (!refundTarget) return;
    const id = refundTarget.id;
    setPendingId(id);
    startTransition(async () => {
      const result = await refundPaymentAction(id, refundReason.trim() || undefined);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('refunded'));
        removeFromQueue(id);
        setRefundTarget(null);
        setRefundReason('');
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
          const id = payment.id;
          const rowPending = isPending && pendingId === id;
          return (
            <div key={payment.id} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {tenantNames[payment.tenant_id] && (
                    <p className="truncate text-xs font-medium text-muted-foreground">
                      {tenantNames[payment.tenant_id]}
                    </p>
                  )}
                  <p className="truncate text-sm font-medium">{payment.tenant?.email ?? `Tenant #${payment.tenant_id}`}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currencyFormatter.format(Number(payment.total_amount))}
                    {' · '}
                    {tPricing.has(`tiers.${payment.tier}.name` as Parameters<typeof tPricing>[0])
                      ? tPricing(`tiers.${payment.tier}.name` as Parameters<typeof tPricing>[0])
                      : payment.tier}
                    {' · '}
                    {payment.purpose}
                  </p>
                  {payment.reported_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('reportedAt', { date: dateFormatter.format(new Date(payment.reported_at)) })}
                    </p>
                  )}
                  {payment.verified_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('verifiedAt', { date: dateFormatter.format(new Date(payment.verified_at)) })}
                    </p>
                  )}
                  {payment.rejection_reason && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`rejectDialog.reasons.${payment.rejection_reason as 'AMOUNT_MISMATCH' | 'TRANSFER_NOT_FOUND' | 'WRONG_ACCOUNT' | 'ILLEGIBLE_PROOF' | 'DUPLICATE_SUBMISSION' | 'OTHER'}`)}
                    </p>
                  )}
                  {payment.invoice_access_key && (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {t('invoiceAccessKey', { key: payment.invoice_access_key })}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {reviewable ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setProofTarget(payment)}>
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
                          setRejectionReasonCode('');
                        }}
                      >
                        {t('reject')}
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Primary view button: the linked invoice when there is one to
                          show (production only, see ADR-027), proofs otherwise — except
                          a Payphone card payment, which never has proofs to view at all
                          (it verifies itself; nothing was ever uploaded), so a "Ver
                          comprobantes" button there would just open an always-empty
                          dialog. Show a plain badge instead. */}
                      {payment.invoice_access_key ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewAccessKey(payment.invoice_access_key)}
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          {t('viewInvoice')}
                        </Button>
                      ) : payment.method === 'PAYPHONE_CARD' ? (
                        <Badge variant="outline" className="gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" aria-hidden />
                          {t('paidByCard')}
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setProofTarget(payment)}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          {t('viewProofs')}
                        </Button>
                      )}

                      {(payment.invoice_access_key || payment.status === 'VERIFIED') && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="outline" size="icon-sm" aria-label={t('moreActions')} />}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {payment.invoice_access_key && payment.method !== 'PAYPHONE_CARD' && (
                              <DropdownMenuItem onClick={() => setProofTarget(payment)}>
                                <Eye className="h-4 w-4" />
                                {t('viewProofs')}
                              </DropdownMenuItem>
                            )}
                            {/* applied_from is the rollback snapshot the refund endpoint
                                needs (ADR-027) — a payment applied before that migration
                                has none, so the item stays visible but disabled rather
                                than vanishing with no explanation. */}
                            {payment.status === 'VERIFIED' && (
                              <DropdownMenuItem
                                disabled={rowPending || !payment.applied_from}
                                title={payment.applied_from ? undefined : t('refundUnavailable')}
                                onClick={() => {
                                  setRefundTarget(payment);
                                  setRefundReason('');
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Undo2 className="h-4 w-4" />
                                {t('refund')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
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
          <div className="space-y-2">
            <Label>{t('rejectDialog.reasonLabel')}</Label>
            <Select value={rejectionReasonCode} onValueChange={(v) => v && setRejectionReasonCode(v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('rejectDialog.reasonPlaceholder')}>
                  {(v: string) => v ? t(`rejectDialog.reasons.${v as 'AMOUNT_MISMATCH' | 'TRANSFER_NOT_FOUND' | 'WRONG_ACCOUNT' | 'ILLEGIBLE_PROOF' | 'DUPLICATE_SUBMISSION' | 'OTHER'}`) : t('rejectDialog.reasonPlaceholder')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-max">
                {(['AMOUNT_MISMATCH', 'TRANSFER_NOT_FOUND', 'WRONG_ACCOUNT', 'ILLEGIBLE_PROOF', 'DUPLICATE_SUBMISSION', 'OTHER'] as const).map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`rejectDialog.reasons.${code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={isPending}>
              {t('rejectDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending || !rejectionReasonCode}
            >
              {t('rejectDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('refundDialog.title')}</DialogTitle>
            <DialogDescription>{t('refundDialog.description')}</DialogDescription>
          </DialogHeader>
          {refundTarget?.applied_from && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {refundTarget.purpose === 'RENEWAL'
                ? t('refundDialog.restore.RENEWAL', {
                    date: refundTarget.applied_from.periodEnd
                      ? dateFormatter.format(new Date(refundTarget.applied_from.periodEnd))
                      : '—',
                  })
                : t(`refundDialog.restore.${refundTarget.purpose === 'INITIAL' ? 'INITIAL' : 'TIER_CHANGE'}` as 'refundDialog.restore.INITIAL' | 'refundDialog.restore.TIER_CHANGE', {
                    tier: tPricing.has(`tiers.${refundTarget.applied_from.tenantTier}.name` as Parameters<typeof tPricing>[0])
                      ? tPricing(`tiers.${refundTarget.applied_from.tenantTier}.name` as Parameters<typeof tPricing>[0])
                      : refundTarget.applied_from.tenantTier,
                  })}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="refund-reason">{t('refundDialog.reasonLabel')}</Label>
            <Textarea
              id="refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={t('refundDialog.reasonPlaceholder')}
              maxLength={200}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={isPending}>
              {t('refundDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRefund} disabled={isPending}>
              {t('refundDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewAccessKey} onOpenChange={(open) => !open && setPreviewAccessKey(null)}>
        <DialogContent className="flex flex-col sm:max-w-3xl h-[90vh] p-0 gap-0">
          <DialogHeader className="flex-row items-center justify-between border-b border-border pl-6 pr-12 py-4 shrink-0">
            <DialogTitle className="text-sm font-semibold font-mono truncate">
              {previewAccessKey}
            </DialogTitle>
            {previewAccessKey && (
              <a
                href={`/api/admin/documents/${previewAccessKey}/ride`}
                download={`RIDE-${previewAccessKey}.pdf`}
                className="shrink-0"
              >
                <Button size="sm" variant="outline" className="h-7">
                  <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {t('proofDialog.download')}
                </Button>
              </a>
            )}
          </DialogHeader>
          <div className="flex flex-1 overflow-hidden">
            {previewAccessKey && (
              <iframe
                src={`/api/admin/documents/${previewAccessKey}/ride`}
                title={`RIDE-${previewAccessKey}`}
                className="h-full w-full border-0"
              />
            )}
          </div>
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
              {currencyFormatter.format(Number(payment.total_amount))}
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
