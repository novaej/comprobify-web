import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireContext } from '@/lib/context';
import { PageHeader } from '@/components/page-header';
import { ShieldAlert } from 'lucide-react';

export default async function NoIssuerAssignedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireContext({ skipIssuer: true });

  const t = await getTranslations('noIssuerAssigned');
  const tDash = await getTranslations('dashboard');

  return (
    <div>
      <PageHeader title={tDash('title')} />

      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-base font-semibold">{t('title')}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{t('description')}</p>
        <p className="mt-3 max-w-sm text-xs text-muted-foreground">{t('hint')}</p>
      </div>
    </div>
  );
}
