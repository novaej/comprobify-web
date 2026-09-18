'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  listReservedApiKeysAction,
  rotateReservedApiKeyAction,
  type AdminReservedApiKeyRow,
} from '@/app/actions/admin';
import type { Role } from '@/lib/rbac';

export function AdminKeyRotationDialog({
  apiTenantId,
  tenantLabel,
  onClose,
}: {
  apiTenantId: string;
  tenantLabel: string;
  onClose: () => void;
}) {
  const t = useTranslations('admin.tenants.keyRotation');
  const tRole = useTranslations('users');
  const tError = useTranslations('apiError');
  const format = useFormatter();
  const [keys, setKeys] = useState<AdminReservedApiKeyRow[] | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const result = await listReservedApiKeysAction(apiTenantId);
      setKeys(result.keys);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiTenantId]);

  function labelFor(role: string | null): string {
    return role ? tRole(`role.${role as Role}`) : t('masterLabel');
  }

  function handleRotate(apiKeyId: string, role: string | null) {
    if (!confirm(t('confirmRotate', { label: labelFor(role) }))) return;
    setRotatingId(apiKeyId);
    startTransition(async () => {
      const result = await rotateReservedApiKeyAction(apiTenantId, apiKeyId);
      if ('error' in result) {
        toastApiError(result.error, tError);
        setRotatingId(null);
      } else {
        toast.success(t('rotateSuccess'));
        load();
        setRotatingId(null);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { tenant: tenantLabel })}</DialogDescription>
        </DialogHeader>

        {keys === null ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.label')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('columns.environment')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('columns.lastUsed')}</TableHead>
                  <TableHead>{t('columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const rowRotating = rotatingId === key.apiKeyId;
                  return (
                    <TableRow key={key.apiKeyId} className={rowRotating ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="font-medium">{labelFor(key.role)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('createdOn', { date: format.dateTime(new Date(key.createdAt), { dateStyle: 'medium' }) })}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{key.environment}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {key.lastUsedAt ? format.dateTime(new Date(key.lastUsedAt), { dateStyle: 'medium' }) : t('neverUsed')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRotate(key.apiKeyId, key.role)}
                          disabled={isPending}
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          {rowRotating ? t('rotating') : t('rotate')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
