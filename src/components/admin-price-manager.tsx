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
  createTierPriceAction,
  updateTierPriceAction,
  publishTierPriceAction,
} from '@/app/actions/admin';
import { DollarSign, Plus, PenLine, Rocket } from 'lucide-react';
import type { AdminTierPrice, TierName, BillingInterval } from '@/lib/admin-api';
import { ALL_TIERS } from '@/lib/subscription-tiers';

const TIER_ORDER: TierName[] = [...ALL_TIERS];
const INTERVAL_ORDER: BillingInterval[] = ['MONTHLY', 'YEARLY'];

const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

function sortPrices(prices: AdminTierPrice[]): AdminTierPrice[] {
  return [...prices].sort((a, b) => {
    const tierDiff = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (tierDiff !== 0) return tierDiff;
    const intervalDiff = INTERVAL_ORDER.indexOf(a.billingInterval) - INTERVAL_ORDER.indexOf(b.billingInterval);
    if (intervalDiff !== 0) return intervalDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function AdminPriceManager({ prices }: { prices: AdminTierPrice[] }) {
  const t = useTranslations('admin.prices');
  const [localPrices, setLocalPrices] = useState(() => sortPrices(prices));
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminTierPrice | null>(null);
  const [publishTarget, setPublishTarget] = useState<AdminTierPrice | null>(null);

  function handleCreated(price: AdminTierPrice) {
    setLocalPrices((prev) => sortPrices([price, ...prev]));
    setCreateOpen(false);
  }

  function handleUpdated(price: AdminTierPrice) {
    setLocalPrices((prev) => sortPrices(prev.map((p) => (p.id === price.id ? price : p))));
    setEditTarget(null);
  }

  function handlePublished(price: AdminTierPrice) {
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
                  {t('columns.tier')}
                </TableHead>
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
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    {t('empty')}
                  </TableCell>
                </TableRow>
              ) : (
                localPrices.map((price) => {
                  const isUpcoming = price.status === 'PUBLISHED' && price.effectiveAt && new Date(price.effectiveAt).getTime() > now;
                  return (
                    <TableRow key={price.id}>
                      <TableCell className="font-medium">{t(`tiers.${price.tier}`)}</TableCell>
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
  onCreated: (price: AdminTierPrice) => void;
}) {
  const t = useTranslations('admin.prices');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [tier, setTier] = useState<TierName>('STARTER');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('MONTHLY');
  const [priceUsd, setPriceUsd] = useState('');

  function handleSubmit() {
    const parsed = Number(priceUsd);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    startTransition(async () => {
      const result = await createTierPriceAction(tier, billingInterval, parsed);
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
            <DollarSign className="h-4 w-4" aria-hidden />
            {t('createDialog.title')}
          </DialogTitle>
          <DialogDescription>{t('createDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('createDialog.tierLabel')}</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as TierName)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string | null) => (v ? t(`tiers.${v}`) : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIER_ORDER.map((name) => (
                  <SelectItem key={name} value={name}>
                    {t(`tiers.${name}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label htmlFor="new-price-usd">{t('createDialog.priceLabel')}</Label>
            <Input
              id="new-price-usd"
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
  price: AdminTierPrice;
  onClose: () => void;
  onUpdated: (price: AdminTierPrice) => void;
}) {
  const t = useTranslations('admin.prices');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [priceUsd, setPriceUsd] = useState(String(price.priceUsd));

  function handleSubmit() {
    const parsed = Number(priceUsd);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    startTransition(async () => {
      const result = await updateTierPriceAction(price.id, parsed);
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
            {t('editDialog.title', { tier: t(`tiers.${price.tier}`), interval: t(`intervals.${price.billingInterval}`) })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-price-usd">{t('createDialog.priceLabel')}</Label>
          <Input
            id="edit-price-usd"
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
  price: AdminTierPrice;
  onClose: () => void;
  onPublished: (price: AdminTierPrice) => void;
}) {
  const t = useTranslations('admin.prices');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [noticeDays, setNoticeDays] = useState('30');

  function handleSubmit() {
    startTransition(async () => {
      const parsed = noticeDays.trim() ? Number(noticeDays) : undefined;
      const result = await publishTierPriceAction(price.id, parsed);
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
            {t('publishDialog.title', { tier: t(`tiers.${price.tier}`), interval: t(`intervals.${price.billingInterval}`) })}
          </DialogTitle>
          <DialogDescription>
            {t('publishDialog.description', { price: currencyFormatter.format(price.priceUsd) })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300">
          {t('publishDialog.warning')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notice-days">{t('publishDialog.noticeDaysLabel')}</Label>
          <Input
            id="notice-days"
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
