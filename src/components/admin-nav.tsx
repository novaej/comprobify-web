'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Building2, Receipt, FileText, DollarSign, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import { LogoLockup, Logomark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from '@/app/actions/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin/tenants', icon: Building2, labelKey: 'tenants' as const },
  { href: '/admin/payments', icon: Receipt, labelKey: 'payments' as const },
  { href: '/admin/agreements', icon: FileText, labelKey: 'agreements' as const },
  { href: '/admin/prices', icon: DollarSign, labelKey: 'prices' as const },
] as const;

export function AdminNav({ userEmail }: { userEmail: string }) {
  const t = useTranslations('admin.nav');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* Nav links */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
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

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
        <div className="flex items-center justify-between px-3 py-1">
          <p className="truncate text-xs text-sidebar-foreground/50">{userEmail}</p>
          <ThemeToggle />
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {t('signOut')}
          </button>
        </form>
      </div>
    </>
  );

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
        {/* Crosses to the marketing host — must be a plain <a>, never Link. */}
        <a href={`/${locale}`} aria-label={tNav('goToLanding')} className="shrink-0">
          <Logomark className="h-6 w-6" />
        </a>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('title')}
        </span>
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
        aria-label="Admin navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border',
          'transition-transform duration-200',
          'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-none',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo header */}
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Crosses to the marketing host — must be a plain <a>, never Link. */}
          <a href={`/${locale}`} aria-label={tNav('goToLanding')} className="min-w-0 flex-1">
            <LogoLockup className="h-7 w-auto" />
          </a>
          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            <ShieldCheck className="h-3 w-3" />
            {t('adminBadge')}
          </span>
        </div>

        {sidebarContent}
      </nav>
    </>
  );
}
