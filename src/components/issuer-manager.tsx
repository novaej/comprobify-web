'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { addDocumentTypeAction, removeDocumentTypeAction } from '@/app/actions/issuers';
import { Button } from '@/components/ui/button';
import { Building2, Plus, X } from 'lucide-react';
import { toastApiError } from '@/lib/api-error-toast';

interface IssuerWithTypes {
  id: number;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
  isDefault: boolean;
  documentTypes: string[];
}

const ALL_DOC_TYPES = ['01', '04', '05', '06', '07'];

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
            <div className="flex items-start gap-3 mb-4">
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
    </div>
  );
}
