'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { selectIssuerAction } from '@/app/actions/context';
import { Building2 } from 'lucide-react';

interface Issuer {
  id: number;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
}

export function IssuerSelectList({ issuers }: { issuers: Issuer[] }) {
  const t = useTranslations('issuerSelect');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(id: number) {
    startTransition(async () => {
      await selectIssuerAction(id);
      router.push('/dashboard');
    });
  }

  if (issuers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <ul className="divide-y divide-border">
        {issuers.map((issuer) => (
          <li key={issuer.id}>
            <button
              onClick={() => handleSelect(issuer.id)}
              disabled={isPending}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
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
          </li>
        ))}
      </ul>
    </div>
  );
}
