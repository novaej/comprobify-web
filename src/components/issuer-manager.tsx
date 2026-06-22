'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { addDocumentTypeAction, removeDocumentTypeAction, updateIssuerLogoAction } from '@/app/actions/issuers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Building2, Plus, X, ShieldCheck, AlertTriangle, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toastApiError } from '@/lib/api-error-toast';

interface IssuerWithTypes {
  id: number;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
  isDefault: boolean;
  documentTypes: string[];
  certFingerprint: string | null;
  certExpiry: string | null;
}

const ALL_DOC_TYPES = ['01', '04', '05', '06', '07'];

// Mirrors the thresholds in comprobify/src/services/notification.service.js
const CERT_WARN_DAYS = 30;
const CERT_ERROR_DAYS = 7;

function CertInfo({ certFingerprint, certExpiry }: { certFingerprint: string | null; certExpiry: string | null }) {
  const t = useTranslations('issuers');
  const format = useFormatter();

  if (!certFingerprint || !certExpiry) {
    return <p className="text-xs text-muted-foreground">{t('cert.unavailable')}</p>;
  }

  const daysRemaining = Math.floor((new Date(certExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const status =
    daysRemaining <= 0 ? 'expired' : daysRemaining <= CERT_ERROR_DAYS ? 'critical' : daysRemaining <= CERT_WARN_DAYS ? 'warning' : 'ok';

  const Icon = status === 'ok' ? ShieldCheck : status === 'warning' ? AlertTriangle : AlertCircle;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs',
        status === 'ok' && 'border-border bg-muted/40 text-muted-foreground',
        status === 'warning' && 'border-amber-400/40 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
        (status === 'critical' || status === 'expired') && 'border-destructive/40 bg-destructive/5 text-destructive',
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {status === 'expired'
          ? t('cert.expired')
          : t('cert.expiresOn', { date: format.dateTime(new Date(certExpiry), { dateStyle: 'medium' }) })}
      </span>
      <span className="font-mono opacity-80 break-all">{t('cert.fingerprint')}: {certFingerprint}</span>
    </div>
  );
}

function LogoDialog({ issuerId, open, onOpenChange }: { issuerId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('issuers');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [hasFile, setHasFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set('logo', file);
    startTransition(async () => {
      const result = await updateIssuerLogoAction(issuerId, formData);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('logo.success'));
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('logo.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('logo.hint')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          disabled={isPending}
          onChange={(e) => setHasFile(!!e.target.files?.[0])}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
        />
        <DialogFooter>
          <Button size="sm" onClick={handleSubmit} disabled={isPending || !hasFile}>
            {isPending ? t('logo.uploading') : t('logo.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssuerManager({
  issuers,
  canManage,
}: {
  issuers: IssuerWithTypes[];
  canManage: boolean;
}) {
  const t = useTranslations('issuers');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [logoTarget, setLogoTarget] = useState<number | null>(null);

  function handleAddType(issuerId: number, code: string) {
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

  if (issuers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="space-y-4">
      {issuers.map((issuer) => {
        const missing = ALL_DOC_TYPES.filter((c) => !issuer.documentTypes.includes(c));
        return (
          <div key={issuer.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
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
                <Button size="sm" variant="outline" onClick={() => setLogoTarget(issuer.id)} className="shrink-0">
                  <ImageIcon className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('logo.change')}</span>
                </Button>
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
                    {canManage && (
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
                {canManage && missing.map((code) => (
                  <button
                    key={code}
                    onClick={() => handleAddType(issuer.id, code)}
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

      {canManage && logoTarget !== null && (
        <LogoDialog
          issuerId={logoTarget}
          open={logoTarget !== null}
          onOpenChange={(open) => { if (!open) setLogoTarget(null); }}
        />
      )}
    </div>
  );
}
