'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  LayoutDashboard, Files, Users, Package, Settings, Building2,
  Menu, X, LogOut, Globe, ChevronDown,
} from 'lucide-react';
import { NotificationBell } from '@/components/notification-bell';
import type { listNotificationsAction } from '@/app/actions/notifications';
import { Logomark, LogoLockup } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { selectIssuerAction } from '@/app/actions/context';
import { logoutAction } from '@/app/actions/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' as const, requiresIssuer: true },
  { href: '/documents', icon: Files, labelKey: 'documents' as const, requiresIssuer: true },
  { href: '/clients', icon: Users, labelKey: 'clients' as const, requiresIssuer: true },
  { href: '/catalog', icon: Package, labelKey: 'catalog' as const, requiresIssuer: true },
  { href: '/issuers', icon: Building2, labelKey: 'issuers' as const, requiresIssuer: false },
  { href: '/settings', icon: Settings, labelKey: 'settings' as const, requiresIssuer: false },
] as const;

const locales = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
] as const;

interface Issuer {
  id: number;
  name: string;
  branchCode: string;
  issuePointCode: string;
}

type NotificationItem = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

interface NavProps {
  hasIssuer: boolean;
  environment: 'sandbox' | 'production';
  tenantName: string | null;
  currentIssuer: Issuer | null;
  issuers: Issuer[];
  userEmail: string;
  initialUnreadCount: number;
  initialNotifications: NotificationItem[];
}

// ── TenantBadge ───────────────────────────────────────────────────────────────

function TenantBadge({ name, environment }: { name: string | null; environment: 'sandbox' | 'production' }) {
  const t = useTranslations('sandbox');
  return (
    <div className="min-w-0">
      {name && (
        <p className="truncate text-xs font-semibold text-sidebar-foreground leading-none">
          {name}
        </p>
      )}
      <span className={cn(
        'mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
        environment === 'production'
          ? 'bg-green-500/15 text-green-400'
          : 'bg-amber-500/15 text-amber-400'
      )}>
        {environment === 'production' ? t('productionBadge') : t('badge')}
      </span>
    </div>
  );
}

// ── IssuerSwitcher ────────────────────────────────────────────────────────────

function IssuerSwitcher({
  currentIssuer,
  issuers,
  onClose,
}: {
  currentIssuer: Issuer | null;
  issuers: Issuer[];
  onClose?: () => void;
}) {
  const t = useTranslations('nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const displayName = currentIssuer
    ? `${currentIssuer.branchCode}-${currentIssuer.issuePointCode} ${currentIssuer.name}`
    : t('noIssuer');

  function handleSelect(id: number) {
    setOpen(false);
    startTransition(async () => {
      await selectIssuerAction(id);
      router.refresh();
      onClose?.();
    });
  }

  if (issuers.length <= 1) {
    return (
      <p className="truncate text-xs text-sidebar-foreground/70 mt-0.5">
        {currentIssuer
          ? `${currentIssuer.branchCode}-${currentIssuer.issuePointCode}`
          : t('noIssuer')}
      </p>
    );
  }

  return (
    <div ref={ref} className="relative mt-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex max-w-full items-center gap-1 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-50 transition-colors"
      >
        <span className="truncate">{displayName}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-sidebar-border bg-sidebar shadow-lg">
          {issuers.map((issuer) => (
            <button
              key={issuer.id}
              onClick={() => handleSelect(issuer.id)}
              disabled={isPending}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors first:rounded-t-lg last:rounded-b-lg',
                issuer.id === currentIssuer?.id
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{issuer.branchCode}-{issuer.issuePointCode} {issuer.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── UserMenu ──────────────────────────────────────────────────────────────────

function UserMenu({ email, pathname }: { email: string; pathname: string }) {
  const t = useTranslations('nav');
  const locale = useLocale();

  return (
    <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
      <p className="truncate px-3 py-1 text-xs text-sidebar-foreground/50">{email}</p>
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
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export function Nav({ hasIssuer, environment, tenantName, currentIssuer, issuers, userEmail, initialUnreadCount, initialNotifications }: NavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const visibleNavItems = navItems.filter(({ requiresIssuer }) => !requiresIssuer || hasIssuer);

  const sidebarContent = (
    <>
      {/* Tenant + issuer header */}
      <div className="border-b border-sidebar-border px-4 py-3">
        <TenantBadge name={tenantName} environment={environment} />
        <IssuerSwitcher
          currentIssuer={currentIssuer}
          issuers={issuers}
          onClose={() => setIsOpen(false)}
        />
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

      {/* User menu */}
      <UserMenu email={userEmail} pathname={pathname} />
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Logomark className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <IssuerSwitcher
              currentIssuer={currentIssuer}
              issuers={issuers}
              onClose={() => setIsOpen(false)}
            />
          </div>
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
          <LogoLockup className="h-7 w-auto flex-1" />
          <NotificationBell
            initialUnreadCount={initialUnreadCount}
            initialNotifications={initialNotifications}
          />
        </div>

        {sidebarContent}
      </nav>
    </>
  );
}
