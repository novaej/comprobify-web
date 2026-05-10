'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LayoutDashboard, FilePlus, Settings, Menu, X, LogOut, Globe } from 'lucide-react';
import { Logomark, LogoLockup } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' as const },
  { href: '/invoices/new', icon: FilePlus, labelKey: 'newInvoice' as const },
  { href: '/settings', icon: Settings, labelKey: 'settings' as const },
] as const;

const locales = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
] as const;

export function Nav({ hasIssuer }: { hasIssuer: boolean }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const visibleNavItems = hasIssuer
    ? navItems
    : navItems.filter(({ href }) => href === '/settings');

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Logomark variant="light" className="h-6 w-6" />
          <span className="text-sm font-semibold">Comprobify</span>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col bg-sidebar border-r border-sidebar-border',
          'transition-transform duration-200',
          'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-none',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
          <LogoLockup variant="dark" className="h-7 w-auto" />
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {visibleNavItems.map(({ href, icon: Icon, labelKey }) => {
              const isActive = pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {t(labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer: locale + sign out */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" aria-hidden />
              {locales.map(({ code, label }) => (
                <Link
                  key={code}
                  href={pathname}
                  locale={code}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs transition-colors',
                    locale === code
                      ? 'font-semibold text-sidebar-foreground'
                      : 'text-sidebar-foreground/40 hover:text-sidebar-foreground/70'
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {t('signOut')}
          </button>
        </div>
      </nav>
    </>
  );
}
