'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AccessKeyCopy } from '@/components/access-key-copy';
import { linkInvoiceAction } from '@/app/actions/admin';
import { Link2 } from 'lucide-react';
import type { AdminPendingInvoiceItem } from '@/lib/admin-api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' });

export function AdminInvoicingManager({ items: initialItems }: { items: AdminPendingInvoiceItem[] }) {
  const t = useTranslations('admin.invoicing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [linkTarget, setLinkTarget] = useState<AdminPendingInvoiceItem | null>(null);
  const [linkAccessKey, setLinkAccessKey] = useState('');

  function handleLinkInvoice() {
    if (!linkTarget || !linkAccessKey.trim()) return;
    const subscriptionId = linkTarget.subscription.id;
    const paymentId = linkTarget.payment.id;
    const accessKey = linkAccessKey.trim();
    startTransition(async () => {
      const result = await linkInvoiceAction(subscriptionId, accessKey);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('invoiceLinked'));
        setItems((prev) => prev.filter((item) => item.payment.id !== paymentId));
        setLinkTarget(null);
        setLinkAccessKey('');
      }
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((item) => {
          const { payment, subscription, buyer } = item;
          return (
            <div key={payment.id} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{buyer.businessName ?? buyer.email}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{buyer.email}</p>

                  {buyer.ruc && (
                    <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      {t('ruc', { ruc: buyer.ruc })}
                      <AccessKeyCopy value={buyer.ruc} />
                    </p>
                  )}
                  {buyer.address && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="truncate">{buyer.address}</span>
                      <AccessKeyCopy value={buyer.address} />
                    </p>
                  )}

                  <p className="mt-2 text-sm text-muted-foreground">
                    {currencyFormatter.format(Number(payment.totalAmount))}
                    {' · '}
                    {tPricing.has(`tiers.${subscription.tier}.name` as Parameters<typeof tPricing>[0])
                      ? tPricing(`tiers.${subscription.tier}.name` as Parameters<typeof tPricing>[0])
                      : subscription.tier}
                    {' · '}
                    {t(`purposes.${payment.purpose}` as 'purposes.INITIAL' | 'purposes.TIER_CHANGE' | 'purposes.RENEWAL')}
                  </p>
                  {subscription.currentPeriodStart && subscription.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground">
                      {t('period', {
                        start: dateFormatter.format(new Date(subscription.currentPeriodStart)),
                        end: dateFormatter.format(new Date(subscription.currentPeriodEnd)),
                      })}
                    </p>
                  )}
                  {payment.verifiedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('verifiedAt', { date: dateFormatter.format(new Date(payment.verifiedAt)) })}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => {
                      setLinkTarget(item);
                      setLinkAccessKey('');
                    }}
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {t('linkInvoice')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('linkInvoiceDialog.title')}</DialogTitle>
            <DialogDescription>{t('linkInvoiceDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="invoicing-link-access-key">{t('linkInvoiceDialog.label')}</Label>
            <Input
              id="invoicing-link-access-key"
              value={linkAccessKey}
              onChange={(e) => setLinkAccessKey(e.target.value)}
              placeholder={t('linkInvoiceDialog.placeholder')}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkTarget(null)} disabled={isPending}>
              {t('linkInvoiceDialog.cancel')}
            </Button>
            <Button onClick={handleLinkInvoice} disabled={isPending || !linkAccessKey.trim()}>
              {t('linkInvoiceDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
