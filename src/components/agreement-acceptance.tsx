'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { acceptAgreementsAction } from '@/app/actions/agreements';
import { ExternalLink, CheckCircle2, Clock, FileTextIcon } from 'lucide-react';
import type { ApiOutdatedAgreement } from '@/lib/api';

const CHECKBOX_KEY: Record<string, 'termsLabel' | 'privacyLabel' | 'dpaLabel'> = {
  TERMS: 'termsLabel',
  PRIVACY: 'privacyLabel',
  DPA: 'dpaLabel',
};

export function AgreementAcceptance({ outdated }: { outdated: ApiOutdatedAgreement[] }) {
  const t = useTranslations('agreements');
  const tError = useTranslations('apiError');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(outdated.map((d) => [d.documentType, false]))
  );
  const [error, setError] = useState<string | null>(null);
  const [viewingType, setViewingType] = useState<string | null>(null);

  const allChecked = outdated.every((d) => checked[d.documentType]);

  function handleCheck(documentType: string, value: boolean) {
    setChecked((prev) => ({ ...prev, [documentType]: value }));
  }

  function handleAccept() {
    if (!allChecked) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptAgreementsAction();
      if (result && 'error' in result) {
        const code = result.error;
        setError(
          tError.has(code as Parameters<typeof tError>[0])
            ? tError(code as Parameters<typeof tError>[0])
            : tError('UNKNOWN')
        );
        return;
      }
      router.push('/dashboard');
    });
  }

  return (
    <div className="space-y-4">
      {outdated.map((doc) => {
        const labelKey = CHECKBOX_KEY[doc.documentType];
        const isChecked = checked[doc.documentType] ?? false;
        return (
          <div key={doc.documentType} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {t(`documentTitles.${doc.documentType}` as Parameters<typeof t>[0])}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('versionLabel', { version: doc.currentVersion })}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  doc.status === 'PENDING'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {doc.status === 'PENDING' ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {doc.status === 'PENDING' ? t('statusPending') : t('statusAccepted')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setViewingType(doc.documentType)}
              className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-4 hover:text-primary/80"
            >
              <FileTextIcon className="h-3 w-3" aria-hidden />
              {t('viewDocument')}
            </button>

            {labelKey && (
              <div className="flex items-start gap-2.5">
                <input
                  id={`agree_${doc.documentType}`}
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleCheck(doc.documentType, e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                />
                <label
                  htmlFor={`agree_${doc.documentType}`}
                  className="cursor-pointer text-sm leading-snug"
                >
                  {t(labelKey)}
                </label>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleAccept} disabled={!allChecked || isPending}>
        {isPending ? t('accepting') : t('accept')}
      </Button>

      <Dialog open={viewingType !== null} onOpenChange={(open) => { if (!open) setViewingType(null); }}>
        <DialogContent className="flex flex-col sm:max-w-3xl h-[85vh] p-0 gap-0">
          <DialogHeader className="flex-row items-center gap-4 border-b border-border pl-6 pr-12 py-4 shrink-0">
            <DialogTitle className="flex-1 text-sm font-semibold">
              {viewingType
                ? t(`documentTitles.${viewingType}` as Parameters<typeof t>[0])
                : ''}
            </DialogTitle>
            {viewingType && (
              <a
                href={`/api/tenant/agreements/${viewingType}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {t('openInTab')}
              </a>
            )}
          </DialogHeader>
          {viewingType && (
            <iframe
              key={viewingType}
              src={`/api/tenant/agreements/${viewingType}`}
              title={t(`documentTitles.${viewingType}` as Parameters<typeof t>[0])}
              className="flex-1 w-full border-0"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
