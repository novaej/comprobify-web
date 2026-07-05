'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { addDocumentTypeAction, removeDocumentTypeAction, removeIssuerAction, activateIssuerAction } from '@/app/actions/issuers';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Building2, Plus, X, Pencil } from 'lucide-react';
import { CertInfo } from '@/components/cert-info';
import { toastApiError } from '@/lib/api-error-toast';
import { cn } from '@/lib/utils';

interface IssuerWithTypes {
  id: number;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
  isDefault: boolean;
  active: boolean;
  documentTypes: string[];
  certFingerprint: string | null;
  certExpiry: string | null;
}

const ALL_DOC_TYPES = ['01', '04', '05', '06', '07'];

export function IssuerManager({
  issuers: initialIssuers,
  canManage,
  allowedDocumentTypes,
}: {
  issuers: IssuerWithTypes[];
  canManage: boolean;
  allowedDocumentTypes: string[];
}) {
  const t = useTranslations('issuers');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [issuers, setIssuers] = useState<IssuerWithTypes[]>(initialIssuers);
  const [addTarget, setAddTarget] = useState<{ issuerId: number; code: string } | null>(null);

  function handleAddType() {
    if (!addTarget) return;
    const { issuerId, code } = addTarget;
    setAddTarget(null);
    startTransition(async () => {
      const result = await addDocumentTypeAction(issuerId, code);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('addDocTypeSuccess'));
      }
    });
  }

  function handleRemoveType(issuerId: number, code: string) {
    startTransition(async () => {
      const result = await removeDocumentTypeAction(issuerId, code);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('removeDocTypeSuccess'));
      }
    });
  }

  function handleToggleActive(issuerId: number, nextActive: boolean) {
    setIssuers((prev) => prev.map((i) => (i.id === issuerId ? { ...i, active: nextActive } : i)));

    startTransition(async () => {
      const result = nextActive
        ? await activateIssuerAction(issuerId)
        : await removeIssuerAction(issuerId);

      if (result?.error) {
        // Revert optimistic update on error.
        setIssuers((prev) => prev.map((i) => (i.id === issuerId ? { ...i, active: !nextActive } : i)));
        toastApiError(result.error, tError);
      } else {
        toast.success(nextActive ? t('activateSuccess') : t('removeSuccess'));
      }
    });
  }

  if (issuers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="space-y-4">
      {issuers.map((issuer) => {
        const missing = ALL_DOC_TYPES.filter(
          (c) => allowedDocumentTypes.includes(c) && !issuer.documentTypes.includes(c)
        );
        return (
          <div
            key={issuer.id}
            className={cn(
              'rounded-xl border border-border bg-card p-5 shadow-sm transition-opacity',
              !issuer.active && 'opacity-60',
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{issuer.tradeName ?? issuer.businessName}</p>
                  <p className="text-xs text-muted-foreground">
                    {issuer.branchCode}-{issuer.issuePointCode}
                    {issuer.isDefault && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                        {t('default')}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-3">
                  {issuer.active && (
                    <Link
                      href={`/issuers/${issuer.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t('edit')}</span>
                    </Link>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {issuer.active ? t('status.active') : t('status.inactive')}
                    </span>
                    <Switch
                      checked={issuer.active}
                      onCheckedChange={(checked) => handleToggleActive(issuer.id, checked)}
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('cert.title')}
              </p>
              <CertInfo certFingerprint={issuer.certFingerprint} certExpiry={issuer.certExpiry} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('documentTypes')}
              </p>
              <div className="flex flex-wrap gap-2">
                {issuer.documentTypes.map((code) => (
                  <span
                    key={code}
                    className="flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium"
                  >
                    {t(`docType.${code}` as Parameters<typeof t>[0])} ({code})
                    {canManage && issuer.active && (
                      <button
                        onClick={() => handleRemoveType(issuer.id, code)}
                        disabled={isPending}
                        className="ml-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {canManage && issuer.active && missing.map((code) => (
                  <button
                    key={code}
                    onClick={() => setAddTarget({ issuerId: issuer.id, code })}
                    disabled={isPending}
                    className="flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    {t(`docType.${code}` as Parameters<typeof t>[0])} ({code})
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <Dialog open={addTarget !== null} onOpenChange={(open) => { if (!open) setAddTarget(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('confirmAddDocType.title')}</DialogTitle>
            <DialogDescription>
              {addTarget
                ? t('confirmAddDocType.description', { docType: t(`docType.${addTarget.code}` as Parameters<typeof t>[0]) })
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('confirmAddDocType.cancel')}
            </DialogClose>
            <Button onClick={handleAddType} disabled={isPending}>
              {t('confirmAddDocType.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
