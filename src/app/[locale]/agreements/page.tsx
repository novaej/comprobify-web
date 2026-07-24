import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { AlertTriangle } from 'lucide-react';
import { getAgreementStatusAction } from '@/app/actions/agreements';
import { AgreementAcceptance } from '@/components/agreement-acceptance';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function AgreementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agreements');

  const status = await getAgreementStatusAction();

  // Render the specific API error inline (with a retry link) rather than throwing it into
  // the generic locale error boundary — that boundary can't recover error.code across the
  // server→client serialization (see CLAUDE.md Common Mistake #28), so it would only ever
  // show apiError.UNKNOWN regardless of what actually failed (e.g. the API being unreachable).
  if ('error' in status) {
    const tError = await getTranslations('common');
    const tApiError = await getTranslations('apiError');
    const message = tApiError.has(status.error) ? tApiError(status.error) : tApiError('UNKNOWN');

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">{t('loadErrorTitle')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        <a href={`/${locale}/agreements`} className={cn(buttonVariants())}>
          {tError('retry')}
        </a>
      </div>
    );
  }

  // If all agreements are already accepted (or none have been published yet),
  // skip the acceptance step and go straight to the dashboard.
  if (!status.needsAcceptance) {
    redirect({ href: '/dashboard', locale });
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8 px-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <AgreementAcceptance outdated={[...status.outdated].sort((a, b) => {
        const ORDER: Record<string, number> = { TERMS: 0, PRIVACY: 1, DPA: 2 };
        return (ORDER[a.documentType] ?? 99) - (ORDER[b.documentType] ?? 99);
      })} />
    </div>
  );
}
