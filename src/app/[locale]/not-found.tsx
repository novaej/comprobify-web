import { getTranslations, getLocale } from 'next-intl/server';
import { FileQuestionMark } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default async function LocaleNotFound() {
  const t = await getTranslations('notFoundPage');
  const locale = await getLocale();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <FileQuestionMark className="h-10 w-10 text-muted-foreground" />
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      {/* Plain <a>, not the i18n Link: client-side navigation away from a
          notFound() boundary silently no-ops (Next.js #49736/#59981) — a
          full browser navigation sidesteps the broken soft-nav state. */}
      <a href={`/${locale}/dashboard`} className={buttonVariants({ variant: 'outline' })}>
        {t('backToDashboard')}
      </a>
    </div>
  );
}
