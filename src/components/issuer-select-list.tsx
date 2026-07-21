'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { selectIssuerAndRedirectAction } from '@/app/actions/context';
import { Building2 } from 'lucide-react';

interface Issuer {
  id: string;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
}

export function IssuerSelectList({ issuers }: { issuers: Issuer[] }) {
  const t = useTranslations('issuerSelect');
  const autoFormRef = useRef<HTMLFormElement>(null);

  // Auto-submit when there's exactly one issuer — no user choice needed.
  // Using form.requestSubmit() avoids the startTransition+router.push pattern
  // that causes "Rendered more hooks than during the previous render" errors.
  useEffect(() => {
    if (issuers.length === 1) {
      autoFormRef.current?.requestSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (issuers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t('empty')}
      </div>
    );
  }

  if (issuers.length === 1) {
    return (
      <form
        ref={autoFormRef}
        action={selectIssuerAndRedirectAction.bind(null, issuers[0].id)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <ul className="divide-y divide-border">
        {issuers.map((issuer) => (
          <li key={issuer.id}>
            <form action={selectIssuerAndRedirectAction.bind(null, issuer.id)}>
              <button
                type="submit"
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">
                    {issuer.tradeName ?? issuer.businessName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('branch')}: {issuer.branchCode}-{issuer.issuePointCode}
                  </p>
                </div>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
