'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle } from 'lucide-react';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { updateTenantTierAction, updateTenantStatusAction, verifyTenantAction } from '@/app/actions/admin';
import { cn } from '@/lib/utils';
import type { AdminTenant } from '@/lib/admin-api';

const TIERS = ['FREE', 'STARTER', 'GROWTH', 'BUSINESS'] as const;
const STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'] as const;

const STATUS_TRIGGER: Record<string, string> = {
  PENDING_VERIFICATION: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25',
  ACTIVE: 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25',
  SUSPENDED: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25',
};

export function AdminTenantManager({ tenants }: { tenants: AdminTenant[] }) {
  const t = useTranslations('admin.tenants');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);

  function handleTierChange(id: number, tier: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await updateTenantTierAction(id, tier);
      if ('error' in result) toastApiError(result.error, tError);
      else toast.success(t('tierUpdated'));
      setPendingId(null);
    });
  }

  function handleStatusChange(id: number, currentStatus: string, newStatus: string) {
    setPendingId(id);
    startTransition(async () => {
      // Use the dedicated verify endpoint when approving a pending tenant.
      const result =
        currentStatus === 'PENDING_VERIFICATION' && newStatus === 'ACTIVE'
          ? await verifyTenantAction(id)
          : await updateTenantStatusAction(id, newStatus as 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED');
      if ('error' in result) toastApiError(result.error, tError);
      else toast.success(newStatus === 'ACTIVE' && currentStatus === 'PENDING_VERIFICATION' ? t('verified') : t('statusUpdated'));
      setPendingId(null);
    });
  }

  function handleVerify(id: number) {
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
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.email')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.tier')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.status')}</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('columns.usage')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => {
            const id = Number(tenant.id);
            const rowPending = isPending && pendingId === id;
            const triggerClass = STATUS_TRIGGER[tenant.status] ?? '';
            return (
              <TableRow key={tenant.id} className={rowPending ? 'opacity-60' : ''}>
                <TableCell className="font-medium">{tenant.email}</TableCell>

                {/* Tier — inline select */}
                <TableCell>
                  <Select
                    value={tenant.subscriptionTier}
                    onValueChange={(value) => value && handleTierChange(id, value)}
                    disabled={rowPending}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue>{(v: string) => v}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier} className="text-xs">
                          {tier}
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
                        <SelectValue>{(v: string) => t(`statuses.${v as 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED'}`)}</SelectValue>
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
                  </div>
                </TableCell>

                {/* Usage */}
                <TableCell className="text-sm text-muted-foreground">
                  {t('usageValue', { count: tenant.documentCount, quota: tenant.documentQuota })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
