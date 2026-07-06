'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createBranchAction } from '@/app/actions/issuers';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';


interface ExistingIssuer {
  id: number;
  branchCode: string;
  businessName: string;
  tradeName: string | null;
}

export function CreateIssuerDialog({ issuers, allowedDocumentTypes }: { issuers: ExistingIssuer[]; allowedDocumentTypes: string[] }) {
  const t = useTranslations('issuers');
  const tCreate = useTranslations('issuers.create');
  const tError = useTranslations('apiError');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<'branch' | 'issuePoint'>('branch');
  const [branchCode, setBranchCode] = useState('');
  const [sourceLocalIssuerId, setSourceLocalIssuerId] = useState<string | null>(null);
  const [issuePointCode, setIssuePointCode] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() =>
    allowedDocumentTypes.includes('01') ? ['01'] : [],
  );
  const [certPassword, setCertPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // One representative issuer per existing branchCode, for the issue-point picker.
  const branchOptions = Array.from(
    new Map(issuers.map((i) => [i.branchCode, i])).values(),
  );

  function toggleType(code: string) {
    setSelectedTypes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function reset() {
    setMode('branch');
    setBranchCode('');
    setSourceLocalIssuerId(null);
    setIssuePointCode('');
    setBranchAddress('');
    setSelectedTypes(allowedDocumentTypes.includes('01') ? ['01'] : []);
    setCertPassword('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSubmit() {
    const formData = new FormData();
    formData.set('mode', mode);
    if (mode === 'issuePoint') {
      if (!sourceLocalIssuerId) return;
      formData.set('sourceLocalIssuerId', sourceLocalIssuerId);
    } else {
      formData.set('branchCode', branchCode.trim());
    }
    formData.set('issuePointCode', issuePointCode.trim());
    if (branchAddress.trim()) formData.set('branchAddress', branchAddress.trim());
    for (const code of selectedTypes) formData.append('documentTypes', code);
    const certFile = fileInputRef.current?.files?.[0];
    if (certFile) {
      formData.set('cert', certFile);
      if (certPassword) formData.set('certPassword', certPassword);
    }

    startTransition(async () => {
      const result = await createBranchAction(formData);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(tCreate('success'));
        setOpen(false);
        reset();
        window.location.reload();
      }
    });
  }

  const canSubmit = mode === 'branch'
    ? branchCode.trim().length === 3 && issuePointCode.trim().length === 3
    : sourceLocalIssuerId !== null && issuePointCode.trim().length === 3;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        {tCreate('button')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tCreate('title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{tCreate('sriHint')}</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tCreate('modeLabel')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('branch')}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                    mode === 'branch' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                  )}
                >
                  {tCreate('modeBranch')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('issuePoint')}
                  disabled={branchOptions.length === 0}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50',
                    mode === 'issuePoint' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                  )}
                >
                  {tCreate('modeIssuePoint')}
                </button>
              </div>
            </div>

            {mode === 'branch' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tCreate('branchCodeLabel')}
                </label>
                <Input
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="001"
                  maxLength={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">{tCreate('branchCodeHint')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tCreate('existingBranchLabel')}
                </label>
                <Select<string>
                  value={sourceLocalIssuerId}
                  onValueChange={(v) => setSourceLocalIssuerId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => {
                        const issuer = branchOptions.find((b) => String(b.id) === v);
                        return issuer ? `${issuer.branchCode} — ${issuer.tradeName ?? issuer.businessName}` : v;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="w-auto min-w-(--anchor-width)">
                    {branchOptions.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.branchCode} — {b.tradeName ?? b.businessName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tCreate('issuePointCodeLabel')}
              </label>
              <Input
                value={issuePointCode}
                onChange={(e) => setIssuePointCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="001"
                maxLength={3}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">{tCreate('issuePointCodeHint')}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tCreate('branchAddressLabel')}
              </label>
              <Input
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tCreate('documentTypesLabel')}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {allowedDocumentTypes.map((code) => (
                  <label
                    key={code}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
                      selectedTypes.includes(code)
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={selectedTypes.includes(code)}
                      onChange={() => toggleType(code)}
                      disabled={isPending}
                    />
                    {t(`docType.${code}` as Parameters<typeof t>[0])} ({code})
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tCreate('certLabel')}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".p12,.pfx,application/x-pkcs12"
                disabled={isPending}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
              />
              <p className="text-xs text-muted-foreground">{tCreate('certHint')}</p>
              <Input
                type="password"
                placeholder={tCreate('certPasswordLabel')}
                value={certPassword}
                onChange={(e) => setCertPassword(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {tCreate('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !canSubmit}>
              {isPending ? tCreate('submitting') : tCreate('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
