'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Building2, Receipt, FileText, LogOut } from 'lucide-react';
import { Logomark } from '@/components/logo';
import { logoutAction } from '@/app/actions/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin/tenants', icon: Building2, labelKey: 'tenants' as const },
  { href: '/admin/payments', icon: Receipt, labelKey: 'payments' as const },
  { href: '/admin/agreements', icon: FileText, labelKey: 'agreements' as const },
] as const;

export function AdminNav({ userEmail }: { userEmail: string }) {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Logomark className="h-6 w-6 shrink-0" />
          <span className="text-sm font-semibold">{t('title')}</span>
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="truncate text-xs text-sidebar-foreground/50">{userEmail}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              {t('signOut')}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
