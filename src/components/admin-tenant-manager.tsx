'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle, KeyRound } from 'lucide-react';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { updateTenantTierAction, updateTenantStatusAction, verifyTenantAction } from '@/app/actions/admin';
import { AdminKeyRotationDialog } from '@/components/admin-key-rotation-dialog';
import { cn } from '@/lib/utils';
import type { AdminTenant, AdminTenantStatus, AdminSuspensionReason } from '@/lib/admin-api';
import { ALL_TIERS } from '@/lib/subscription-tiers';

const TIERS = ALL_TIERS;
const STATUSES: AdminTenantStatus[] = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'PAST_DUE'];
const SUSPENSION_REASONS: AdminSuspensionReason[] = [
  'PAYMENT_REVERSED',
  'FRAUD_SUSPECTED',
  'TERMS_VIOLATION',
  'VOLUNTARY_CLOSURE',
  'UNPAID_BALANCE',
  'OTHER',
];

const STATUS_TRIGGER: Record<string, string> = {
  PENDING_VERIFICATION: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25',
  ACTIVE: 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25',
  SUSPENDED: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25',
  // PAST_DUE is deliberately distinct from SUSPENDED's red — it's a
  // self-resolving billing state, not an admin-imposed suspension (ADR-025).
  PAST_DUE: 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/25',
};

type AdminTenantRow = AdminTenant & { businessName: string | null };

export function AdminTenantManager({ tenants }: { tenants: AdminTenantRow[] }) {
  const t = useTranslations('admin.tenants');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);
  const [suspensionReasonCode, setSuspensionReasonCode] = useState('');
  const [rotationTarget, setRotationTarget] = useState<{ apiTenantId: string; label: string } | null>(null);

  function handleTierChange(id: string, tier: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await updateTenantTierAction(id, tier);
      if ('error' in result) toastApiError(result.error, tError);
      else toast.success(t('tierUpdated'));
      setPendingId(null);
    });
  }

  function handleStatusChange(id: string, currentStatus: string, newStatus: string) {
    // SUSPENDED requires a reason code — collect it via the dialog instead of
    // firing the mutation directly (see ADR-027 on the API side).
    if (newStatus === 'SUSPENDED') {
      setSuspendTarget(id);
      setSuspensionReasonCode('');
      return;
    }
    setPendingId(id);
    startTransition(async () => {
      // Use the dedicated verify endpoint when approving a pending tenant.
      const result =
        currentStatus === 'PENDING_VERIFICATION' && newStatus === 'ACTIVE'
          ? await verifyTenantAction(id)
          : await updateTenantStatusAction(id, newStatus as AdminTenantStatus);
      if ('error' in result) toastApiError(result.error, tError);
      else toast.success(newStatus === 'ACTIVE' && currentStatus === 'PENDING_VERIFICATION' ? t('verified') : t('statusUpdated'));
      setPendingId(null);
    });
  }

  function handleConfirmSuspend() {
    if (!suspendTarget || !suspensionReasonCode) return;
    const id = suspendTarget;
    setPendingId(id);
    startTransition(async () => {
      const result = await updateTenantStatusAction(id, 'SUSPENDED', suspensionReasonCode as AdminSuspensionReason);
      if ('error' in result) toastApiError(result.error, tError);
      else {
        toast.success(t('statusUpdated'));
        setSuspendTarget(null);
        setSuspensionReasonCode('');
      }
      setPendingId(null);
    });
  }

  function handleVerify(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await verifyTenantAction(id);
      if ('error' in result) toastApiError(result.error, tError);
      else toast.success(t('verified'));
      setPendingId(null);
    });
  }

  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.businessName')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.email')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.tier')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.status')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.usage')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => {
            const id = tenant.id;
            const rowPending = isPending && pendingId === id;
            const triggerClass = STATUS_TRIGGER[tenant.status] ?? '';
            return (
              <TableRow key={tenant.id} className={rowPending ? 'opacity-60' : ''}>
                <TableCell className="font-medium">{tenant.businessName ?? '—'}</TableCell>
                <TableCell className="font-medium">{tenant.email}</TableCell>

                {/* Tier — inline select */}
                <TableCell>
                  <Select
                    value={tenant.subscriptionTier}
                    onValueChange={(value) => value && handleTierChange(id, value)}
                    disabled={rowPending}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue>{(v: string) => tPricing(`tiers.${v as (typeof TIERS)[number]}.name`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier} className="text-xs">
                          {tPricing(`tiers.${tier}.name`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Status — badge-styled select + verify shortcut */}
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <Select
                      value={tenant.status}
                      onValueChange={(value) => value && handleStatusChange(id, tenant.status, value)}
                      disabled={rowPending}
                    >
                      <SelectTrigger className={cn('h-7 w-36 rounded-full border px-3 text-xs font-medium shadow-none', triggerClass)}>
                        <SelectValue>{(v: string) => t(`statuses.${v as AdminTenantStatus}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status} className="text-xs">
                            {t(`statuses.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {tenant.status === 'PENDING_VERIFICATION' && (
                      <button
                        onClick={() => handleVerify(id)}
                        disabled={rowPending}
                        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 disabled:opacity-50 dark:text-amber-400 dark:hover:text-amber-200"
                      >
                        <CheckCircle className="h-3 w-3" />
                        {t('verify')}
                      </button>
                    )}

                    {tenant.status === 'SUSPENDED' && tenant.suspensionReasonCode && (
                      <p className="text-xs text-muted-foreground">
                        {t(`suspendDialog.reasons.${tenant.suspensionReasonCode}`)}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Usage */}
                <TableCell className="text-sm text-muted-foreground">
                  {tenant.documentQuota === null
                    ? t('usageValueUnlimited', { count: tenant.documentCount })
                    : t('usageValue', { count: tenant.documentCount, quota: tenant.documentQuota })}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    title={t('rotateKeysTooltip')}
                    aria-label={t('rotateKeysTooltip')}
                    onClick={() => setRotationTarget({ apiTenantId: id, label: tenant.businessName ?? tenant.email })}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={!!suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suspendDialog.title')}</DialogTitle>
            <DialogDescription>{t('suspendDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('suspendDialog.reasonLabel')}</Label>
            <Select value={suspensionReasonCode} onValueChange={(v) => v && setSuspensionReasonCode(v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('suspendDialog.reasonPlaceholder')}>
                  {(v: string) => (v ? t(`suspendDialog.reasons.${v as AdminSuspensionReason}`) : t('suspendDialog.reasonPlaceholder'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-max">
                {SUSPENSION_REASONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`suspendDialog.reasons.${code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)} disabled={isPending}>
              {t('suspendDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmSuspend}
              disabled={isPending || !suspensionReasonCode}
            >
              {t('suspendDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rotationTarget && (
        <AdminKeyRotationDialog
          apiTenantId={rotationTarget.apiTenantId}
          tenantLabel={rotationTarget.label}
          onClose={() => setRotationTarget(null)}
        />
      )}
    </div>
  );
}
