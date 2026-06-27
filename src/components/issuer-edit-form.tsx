'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  updateIssuerAction,
  updateIssuerLogoAction,
  renewIssuerCertificateAction,
  setIssuerSequentialAction,
} from '@/app/actions/issuers';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CertInfo } from '@/components/cert-info';
import { ImageIcon, RefreshCw, Pencil } from 'lucide-react';
import type { ApiIssuerSequential } from '@/lib/api';

interface IssuerDetail {
  id: number;
  ruc: string;
  businessName: string;
  tradeName: string | null;
  branchAddress: string | null;
  branchCode: string;
  issuePointCode: string;
  certFingerprint: string | null;
  certExpiry: string | null;
}

interface SequentialTarget {
  documentType: string;
  environment: 'sandbox' | 'production';
  current: number;
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

function CertRenewalDialog({ issuerId, open, onOpenChange }: { issuerId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('issuers');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [hasFile, setHasFile] = useState(false);
  const [password, setPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set('cert', file);
    if (password) formData.set('certPassword', password);
    startTransition(async () => {
      const result = await renewIssuerCertificateAction(issuerId, formData);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('cert.renewSuccess'));
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('cert.renewTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('cert.renewHint')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".p12,.pfx,application/x-pkcs12"
          disabled={isPending}
          onChange={(e) => setHasFile(!!e.target.files?.[0])}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
        />
        <div className="space-y-1">
          <Input
            type="password"
            placeholder={t('cert.passwordLabel')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">{t('cert.passwordHint')}</p>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={handleSubmit} disabled={isPending || !hasFile}>
            {isPending ? t('cert.renewing') : t('cert.renewSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SequentialEditDialog({
  target,
  value,
  onValueChange,
  isPending,
  onSubmit,
  onClose,
}: {
  target: SequentialTarget | null;
  value: string;
  onValueChange: (value: string) => void;
  isPending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('issuers.sequentials');
  const tDocType = useTranslations('issuers');

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>
        {target && (
          <>
            <p className="text-sm text-muted-foreground">
              {tDocType(`docType.${target.documentType}` as Parameters<typeof tDocType>[0])} ({target.documentType}) — {t(target.environment)}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('nextSequentialLabel')}
              </label>
              <Input
                type="number"
                min={target.current + 1}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">{t('nextSequentialHint', { current: target.current })}</p>
            </div>
          </>
        )}
        <DialogFooter>
          <Button size="sm" onClick={onSubmit} disabled={isPending || !value}>
            {isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssuerEditForm({
  issuer,
  documentTypes,
  initialSequentials,
  tenantEnvironment,
}: {
  issuer: IssuerDetail;
  documentTypes: string[];
  initialSequentials: ApiIssuerSequential[];
  tenantEnvironment: 'sandbox' | 'production';
}) {
  const t = useTranslations('issuers');
  const tSequentials = useTranslations('issuers.sequentials');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [tradeName, setTradeName] = useState(issuer.tradeName ?? '');
  const [branchAddress, setBranchAddress] = useState(issuer.branchAddress ?? '');
  const [logoOpen, setLogoOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [sequentials, setSequentials] = useState(initialSequentials);

  const [sequentialTarget, setSequentialTarget] = useState<SequentialTarget | null>(null);
  const [sequentialValue, setSequentialValue] = useState('');
  const [isSequentialPending, startSequentialTransition] = useTransition();

  // Only the tenant's currently active environment can have its sequential edited —
  // the dormant one isn't in use, so editing it wouldn't affect any real document.
  const canEditSandbox = tenantEnvironment === 'sandbox';
  const canEditProduction = tenantEnvironment === 'production';

  function handleSaveBusinessInfo() {
    startTransition(async () => {
      const result = await updateIssuerAction(issuer.id, {
        tradeName: tradeName.trim() || undefined,
        branchAddress: branchAddress.trim() || undefined,
      });
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('editPage.saveSuccess'));
      }
    });
  }

  function openSequentialEditor(documentType: string, environment: 'sandbox' | 'production', current: number) {
    setSequentialTarget({ documentType, environment, current });
    setSequentialValue(String(current + 1));
  }

  function closeSequentialEditor() {
    setSequentialTarget(null);
    setSequentialValue('');
  }

  function handleSequentialSubmit() {
    if (!sequentialTarget) return;
    const nextSequential = parseInt(sequentialValue, 10);
    if (!Number.isInteger(nextSequential)) return;
    const { documentType, environment } = sequentialTarget;

    startSequentialTransition(async () => {
      const result = await setIssuerSequentialAction(issuer.id, documentType, environment, nextSequential);
      if (result?.error) {
        toastApiError(result.error, tError);
        return;
      }
      toast.success(tSequentials('success'));
      setSequentials((prev) =>
        prev.map((row) =>
          row.documentType === documentType
            ? { ...row, [environment]: { current: nextSequential - 1, next: nextSequential } }
            : row,
        ),
      );
      closeSequentialEditor();
    });
  }

  return (
    <div className="space-y-6">
      {/* Business info */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold">{t('editPage.businessInfoTitle')}</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">RUC</label>
            <Input value={issuer.ruc} disabled readOnly />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{issuer.branchCode}-{issuer.issuePointCode}</label>
            <Input value={issuer.businessName} disabled readOnly />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('editPage.tradeNameLabel')}</label>
          <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} disabled={isPending} maxLength={300} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('editPage.branchAddressLabel')}</label>
          <Input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} disabled={isPending} maxLength={300} />
        </div>

        <p className="text-xs text-muted-foreground">{t('editPage.readOnlyNote')}</p>

        <Button size="sm" onClick={handleSaveBusinessInfo} disabled={isPending}>
          {isPending ? t('editPage.saving') : t('editPage.save')}
        </Button>
      </div>

      {/* Logo + certificate */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('logo.title')}</h2>
          <Button size="sm" variant="outline" onClick={() => setLogoOpen(true)}>
            <ImageIcon className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('logo.change')}</span>
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('cert.title')}</h2>
          <Button size="sm" variant="outline" onClick={() => setCertOpen(true)}>
            <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('cert.renew')}</span>
          </Button>
        </div>
        <CertInfo certFingerprint={issuer.certFingerprint} certExpiry={issuer.certExpiry} />
      </div>

      {/* Sequentials */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold">{tSequentials('title')}</h2>
        <p className="text-xs text-muted-foreground">{tSequentials('description')}</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSequentials('documentType')}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSequentials('sandbox')}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSequentials('production')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sequentials.map((row) => (
                <tr key={row.documentType}>
                  <td className="px-2 py-2 font-medium whitespace-nowrap">
                    {t(`docType.${row.documentType}` as Parameters<typeof t>[0])} ({row.documentType})
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-muted-foreground">{tSequentials('next')}: {row.sandbox.next}</span>
                      <button
                        onClick={() => canEditSandbox && openSequentialEditor(row.documentType, 'sandbox', row.sandbox.current)}
                        disabled={!canEditSandbox}
                        className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
                        aria-label={tSequentials('edit')}
                        title={canEditSandbox ? undefined : tSequentials('disabledSandbox')}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-muted-foreground">{tSequentials('next')}: {row.production.next}</span>
                      <button
                        onClick={() => canEditProduction && openSequentialEditor(row.documentType, 'production', row.production.current)}
                        disabled={!canEditProduction}
                        className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
                        aria-label={tSequentials('edit')}
                        title={canEditProduction ? undefined : tSequentials('disabledProduction')}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sequentials.length === 0 && documentTypes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LogoDialog issuerId={issuer.id} open={logoOpen} onOpenChange={setLogoOpen} />
      <CertRenewalDialog issuerId={issuer.id} open={certOpen} onOpenChange={setCertOpen} />
      <SequentialEditDialog
        target={sequentialTarget}
        value={sequentialValue}
        onValueChange={setSequentialValue}
        isPending={isSequentialPending}
        onSubmit={handleSequentialSubmit}
        onClose={closeSequentialEditor}
      />
    </div>
  );
}
