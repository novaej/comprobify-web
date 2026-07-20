import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Logomark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { MarketingMobileMenu } from '@/components/marketing-mobile-menu';
import { MARKETING_BASE_URL } from '@/lib/seo';

const API_DOCS_URL = 'https://docs.comprobify.com/';

// metadataBase for every (marketing) page's relative OG images / alternates —
// must be the marketing host's own origin, never NEXT_PUBLIC_APP_URL (the app
// host), since this route group is only ever served on comprobify.com /
// staging.comprobify.com.
export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
};

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
    <div className="flex min-h-screen flex-col">
      {/* Sticky so the single primary CTA stays reachable through a long
          scroll. Translucent + blurred rather than solid, so content passing
          underneath still reads as one page. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              locale={locale}
              className="flex items-center gap-2 text-lg font-bold tracking-tight"
            >
              <Logomark className="h-7 w-7" />
              Comprobify
            </Link>

            {/* Capped at three destinations. Everything else lives in the
                footer site map. */}
            <nav className="hidden items-center gap-6 text-sm md:flex">
              <a
                href={`/${locale}#como-empezar`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('nav.howToStart')}
              </a>
              <Link
                href="/pricing"
                locale={locale}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('nav.pricing')}
              </Link>
              <a
                href={API_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('nav.docs')}
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <LocaleSwitcher />
              <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
            </div>
            {/* Login is a text link, not a second button: exactly one filled
                CTA in the header keeps the hierarchy unambiguous. */}
            <a
              href={`/${locale}/login`}
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              {t('nav.login')}
            </a>
            <a href={`/${locale}/register`} className={buttonVariants({ size: 'sm' })}>
              {t('nav.register')}
            </a>
            <MarketingMobileMenu />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-border px-4 py-10 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <FooterColumn title={t('footer.groups.product')}>
              <a href={`/${locale}#como-empezar`} className="hover:text-foreground transition-colors">
                {t('nav.howToStart')}
              </a>
              <Link href="/pricing" locale={locale} className="hover:text-foreground transition-colors">
                {t('footer.pricing')}
              </Link>
            </FooterColumn>

            <FooterColumn title={t('footer.groups.developers')}>
              <a
                href={API_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {t('footer.docs')}
              </a>
            </FooterColumn>

            <FooterColumn title={t('footer.groups.account')}>
              <a href={`/${locale}/login`} className="hover:text-foreground transition-colors">
                {t('footer.login')}
              </a>
              <a href={`/${locale}/register`} className="hover:text-foreground transition-colors">
                {t('footer.register')}
              </a>
            </FooterColumn>

            <FooterColumn title={t('footer.groups.help')}>
              <a href={`/${locale}/support`} className="hover:text-foreground transition-colors">
                {t('footer.support')}
              </a>
            </FooterColumn>
          </div>

          <div className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
            © {new Date().getFullYear()} Comprobify
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</span>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
