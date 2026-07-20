'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Menu, X, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

const API_DOCS_URL = 'https://docs.comprobify.com/';

/**
 * Mobile navigation for the marketing header.
 *
 * Before this existed the header's nav links were simply `hidden sm:flex`, so
 * phone visitors could only reach Pricing and Docs from the footer. Holds the
 * same three destinations as the desktop nav plus login, language and theme.
 */
export function MarketingMobileMenu() {
  const t = useTranslations('marketing');
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open so the page behind doesn't move.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('nav.openMenu')}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 top-0 z-50 flex flex-col gap-1 border-b border-border bg-background p-4 shadow-lg md:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{t('nav.menu')}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('nav.closeMenu')}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {/* Same-domain marketing anchor — plain <a> so the hash jump works
                from /pricing as well as from the landing page itself. */}
            <a
              href={`/${locale}#como-empezar`}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              {t('nav.howToStart')}
            </a>
            <Link
              href="/pricing"
              locale={locale}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              {t('nav.pricing')}
            </Link>
            <a
              href={API_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              {t('nav.docs')}
              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </a>
            {/* Crosses to the app host — must be a plain <a>, never <Link>. */}
            <a
              href={`/${locale}/login`}
              className="rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              {t('nav.login')}
            </a>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <LocaleSwitcher />
              <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
