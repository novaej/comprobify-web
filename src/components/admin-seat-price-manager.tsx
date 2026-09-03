'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createSeatPriceAction,
  updateSeatPriceAction,
  publishSeatPriceAction,
} from '@/app/actions/admin';
import { Users, Plus, PenLine, Rocket } from 'lucide-react';
import type { AdminSeatPrice, BillingInterval } from '@/lib/admin-api';

// No TIER_ORDER here — unlike admin-price-manager.tsx, seat prices have no
// tier dimension at all (the add-on's price is flat across every tier).
const INTERVAL_ORDER: BillingInterval[] = ['MONTHLY', 'YEARLY'];

const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

function sortPrices(prices: AdminSeatPrice[]): AdminSeatPrice[] {
  return [...prices].sort((a, b) => {
    const intervalDiff = INTERVAL_ORDER.indexOf(a.billingInterval) - INTERVAL_ORDER.indexOf(b.billingInterval);
    if (intervalDiff !== 0) return intervalDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function AdminSeatPriceManager({ prices }: { prices: AdminSeatPrice[] }) {
  const t = useTranslations('admin.seatPrices');
  const [localPrices, setLocalPrices] = useState(() => sortPrices(prices));
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminSeatPrice | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminSeatPrice | null>(null);

  function handleCreated(price: AdminSeatPrice) {
    setLocalPrices((prev) => sortPrices([price, ...prev]));
    setCreateOpen(false);
  }

  function handleUpdated(price: AdminSeatPrice) {
    setLocalPrices((prev) => sortPrices(prev.map((p) => (p.id === price.id ? price : p))));
    setEditTarget(null);
  }

  function handlePublished(price: AdminSeatPrice) {
    setLocalPrices((prev) => sortPrices(prev.map((p) => (p.id === price.id ? price : p))));
    setPublishTarget(null);
  }

  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {t('newPrice')}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('columns.interval')}
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('columns.price')}
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('columns.status')}
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('columns.effectiveAt')}
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('columns.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localPrices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    {t('empty')}
                  </TableCell>
                </TableRow>
              ) : (
                localPrices.map((price) => {
                  const isUpcoming = price.status === 'PUBLISHED' && price.effectiveAt && new Date(price.effectiveAt).getTime() > now;
                  return (
                    <TableRow key={price.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {t(`intervals.${price.billingInterval}`)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{currencyFormatter.format(price.priceUsd)}</TableCell>
                      <TableCell>
                        {price.status === 'DRAFT' ? (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            {t('status.draft')}
                          </Badge>
                        ) : isUpcoming ? (
                          <Badge variant="outline">{t('status.scheduled')}</Badge>
                        ) : (
                          <Badge className="bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30">
                            {t('status.active')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {price.effectiveAt ? dateFormatter.format(new Date(price.effectiveAt)) : '—'}
                      </TableCell>
                      <TableCell>
                        {price.status === 'DRAFT' && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditTarget(price)}>
                              <PenLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              {t('edit')}
                            </Button>
                            <Button size="sm" onClick={() => setPublishTarget(price)}>
                              <Rocket className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              {t('publish')}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />

      {editTarget && (
        <EditDialog price={editTarget} onClose={() => setEditTarget(null)} onUpdated={handleUpdated} />
      )}

      {publishTarget && (
        <PublishDialog price={publishTarget} onClose={() => setPublishTarget(null)} onPublished={handlePublished} />
      )}
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (price: AdminSeatPrice) => void;
}) {
  const t = useTranslations('admin.seatPrices');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('MONTHLY');
  const [priceUsd, setPriceUsd] = useState('');

  function handleSubmit() {
    const parsed = Number(priceUsd);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    startTransition(async () => {
      const result = await createSeatPriceAction(billingInterval, parsed);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('created'));
        setPriceUsd('');
        onCreated(result.price);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden />
            {t('createDialog.title')}
          </DialogTitle>
          <DialogDescription>{t('createDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('createDialog.intervalLabel')}</Label>
            <Select value={billingInterval} onValueChange={(v) => setBillingInterval(v as BillingInterval)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string | null) => (v ? t(`intervals.${v}`) : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_ORDER.map((interval) => (
                  <SelectItem key={interval} value={interval}>
                    {t(`intervals.${interval}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-seat-price-usd">{t('createDialog.priceLabel')}</Label>
            <Input
              id="new-seat-price-usd"
              type="number"
              min="0"
              step="0.01"
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">{t('createDialog.priceHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !priceUsd.trim()}>
            {isPending ? t('createDialog.submitting') : t('createDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog (DRAFT only) ──────────────────────────────────────────────────

function EditDialog({
  price,
  onClose,
  onUpdated,
}: {
  price: AdminSeatPrice;
  onClose: () => void;
  onUpdated: (price: AdminSeatPrice) => void;
}) {
  const t = useTranslations('admin.seatPrices');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [priceUsd, setPriceUsd] = useState(String(price.priceUsd));

  function handleSubmit() {
    const parsed = Number(priceUsd);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    startTransition(async () => {
      const result = await updateSeatPriceAction(price.id, parsed);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('updated'));
        onUpdated(result.price);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('editDialog.title', { interval: t(`intervals.${price.billingInterval}`) })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-seat-price-usd">{t('createDialog.priceLabel')}</Label>
          <Input
            id="edit-seat-price-usd"
            type="number"
            min="0"
            step="0.01"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !priceUsd.trim()}>
            {isPending ? t('createDialog.submitting') : t('createDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Publish dialog ────────────────────────────────────────────────────────────

function PublishDialog({
  price,
  onClose,
  onPublished,
}: {
  price: AdminSeatPrice;
  onClose: () => void;
  onPublished: (price: AdminSeatPrice) => void;
}) {
  const t = useTranslations('admin.seatPrices');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [noticeDays, setNoticeDays] = useState('30');

  function handleSubmit() {
    startTransition(async () => {
      const parsed = noticeDays.trim() ? Number(noticeDays) : undefined;
      const result = await publishSeatPriceAction(price.id, parsed);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('published'));
        onPublished(result.price);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" aria-hidden />
            {t('publishDialog.title', { interval: t(`intervals.${price.billingInterval}`) })}
          </DialogTitle>
          <DialogDescription>
            {t('publishDialog.description', { price: currencyFormatter.format(price.priceUsd) })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300">
          {t('publishDialog.warning')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seat-notice-days">{t('publishDialog.noticeDaysLabel')}</Label>
          <Input
            id="seat-notice-days"
            type="number"
            min="30"
            value={noticeDays}
            onChange={(e) => setNoticeDays(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">{t('publishDialog.noticeDaysHint')}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? t('publishDialog.submitting') : t('publishDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
