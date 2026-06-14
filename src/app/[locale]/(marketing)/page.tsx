import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect, Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Code2, FileText, ArrowRight } from 'lucide-react';

const API_DOCS_URL = 'https://novaej.github.io/comprobify/';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('landing');

  return (
    <>
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16 md:py-28">
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight max-w-3xl leading-tight">
          {t('hero.title')}
        </h1>
        <p className="mt-5 text-muted-foreground text-base md:text-lg max-w-xl">
          {t('hero.subtitle')}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            locale={locale}
            className={buttonVariants({ size: 'lg' })}
          >
            {t('hero.cta.register')}
          </Link>
          <Link
            href="/login"
            locale={locale}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            {t('hero.cta.login')}
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section className="border-t px-4 md:px-8 py-12 md:py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">{t('features.api.title')}</h2>
            <p className="text-muted-foreground text-sm flex-1">
              {t('features.api.description')}
            </p>
            <a
              href={API_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'self-start')}
            >
              {t('features.api.cta')}
              <ArrowRight className="ml-1 w-4 h-4" />
            </a>
          </div>

          <div className="border rounded-lg p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">{t('features.web.title')}</h2>
            <p className="text-muted-foreground text-sm flex-1">
              {t('features.web.description')}
            </p>
            <Link
              href="/register"
              locale={locale}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'self-start')}
            >
              {t('features.web.cta')}
              <ArrowRight className="ml-1 w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
