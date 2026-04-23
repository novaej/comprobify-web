'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LayoutDashboard, FilePlus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' as const },
  { href: '/invoices/new', icon: FilePlus, labelKey: 'newInvoice' as const },
  { href: '/settings', icon: Settings, labelKey: 'settings' as const },
] as const;

export function Nav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="flex w-56 shrink-0 flex-col border-r border-border bg-background"
    >
      {/* Logo / brand */}
      <div className="flex h-14 items-center border-b border-border px-4">
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
    </nav>
  );
}
