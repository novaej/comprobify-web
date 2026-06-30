'use client';

import { useState, useTransition } from 'react';
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
import type { AdminPayment } from '@/lib/admin-api';

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
                  {payment.proof_filename && (
                    <a
                      href={`/api/admin/payments/${payment.id}/proof`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {t('viewProof')}
                    </a>
                  )}
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
    </>
  );
}
