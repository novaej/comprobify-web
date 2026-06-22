import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Logomark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleSwitcher } from '@/components/locale-switcher';

const API_DOCS_URL = 'https://docs.comprobify.com/';

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('marketing');

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b px-4 md:px-8 py-4 flex items-center justify-between">
        <Link href="/" locale={locale} className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <Logomark className="h-7 w-7" />
          Comprobify
        </Link>
        <div className="flex items-center gap-6">
          <nav className="hidden sm:flex items-center gap-5 text-sm">
            <Link
              href="/pricing"
              locale={locale}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('nav.pricing')}
            </Link>
            <a
              href={API_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('nav.docs')}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
            <Link
              href="/login"
              locale={locale}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              {t('nav.login')}
            </Link>
            <Link
              href="/register"
              locale={locale}
              className={buttonVariants({ size: 'sm' })}
            >
              {t('nav.register')}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t px-4 md:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Comprobify</span>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/pricing"
            locale={locale}
            className="hover:text-foreground transition-colors"
          >
            {t('footer.pricing')}
          </Link>
          <a
            href={API_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            {t('footer.docs')}
          </a>
          <Link
            href="/login"
            locale={locale}
            className="hover:text-foreground transition-colors"
          >
            {t('footer.login')}
          </Link>
          <Link
            href="/register"
            locale={locale}
            className="hover:text-foreground transition-colors"
          >
            {t('footer.register')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
