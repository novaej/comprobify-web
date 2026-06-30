'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { updateTenantTierAction, updateTenantStatusAction, verifyTenantAction } from '@/app/actions/admin';
import type { AdminTenant } from '@/lib/admin-api';

const TIERS = ['FREE', 'STARTER', 'GROWTH', 'BUSINESS'] as const;
const STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'] as const;

const STATUS_STYLES: Record<string, string> = {
  PENDING_VERIFICATION: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  SUSPENDED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
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
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('tierUpdated'));
      }
      setPendingId(null);
    });
  }

  function handleStatusChange(id: number, status: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await updateTenantStatusAction(id, status as 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED');
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('statusUpdated'));
      }
      setPendingId(null);
    });
  }

  function handleVerify(id: number) {
    setPendingId(id);
    startTransition(async () => {
      const result = await verifyTenantAction(id);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('verified'));
      }
      setPendingId(null);
    });
  }

  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.email')}</TableHead>
            <TableHead>{t('columns.tier')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            <TableHead>{t('columns.usage')}</TableHead>
            <TableHead>{t('columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => {
            const id = Number(tenant.id);
            const rowPending = isPending && pendingId === id;
            return (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">{tenant.email}</TableCell>
                <TableCell>
                  <Select
                    value={tenant.subscriptionTier}
                    onValueChange={(value) => value && handleTierChange(id, value)}
                  >
                    <SelectTrigger className="w-32" disabled={rowPending}>
                      <SelectValue>{(value: string) => value}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier}>
                          {tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={STATUS_STYLES[tenant.status] ?? ''}>
                      {tenant.status}
                    </Badge>
                    <Select
                      value={tenant.status}
                      onValueChange={(value) => value && handleStatusChange(id, value)}
                    >
                      <SelectTrigger className="w-40" disabled={rowPending}>
                        <SelectValue>{(value: string) => value}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  {t('usageValue', { count: tenant.documentCount, quota: tenant.documentQuota })}
                </TableCell>
                <TableCell>
                  {tenant.status === 'PENDING_VERIFICATION' && (
                    <Button size="sm" variant="outline" disabled={rowPending} onClick={() => handleVerify(id)}>
                      {t('verify')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
