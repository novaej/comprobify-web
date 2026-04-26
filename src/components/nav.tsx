'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LayoutDashboard, FilePlus, Settings, Menu, X, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' as const },
  { href: '/invoices/new', icon: FilePlus, labelKey: 'newInvoice' as const },
  { href: '/settings', icon: Settings, labelKey: 'settings' as const },
] as const;

export function Nav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1 hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold tracking-tight">Comprobify</span>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 flex-col border-r border-border bg-background',
          'transition-transform duration-200',
          'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-none',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo / brand */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 hover:bg-accent md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold tracking-tight">Comprobify</span>
        </div>

        {/* Links */}
        <ul className="flex flex-col gap-1 p-2">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
            const isActive = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {t(labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Sign out */}
        <div className="mt-auto border-t border-border p-2">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {t('signOut')}
          </button>
        </div>
      </nav>
    </>
  );
}
