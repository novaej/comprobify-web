'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  LayoutDashboard, Files, Users, UsersRound, Package, Settings, Building2,
  Menu, X, LogOut, Globe, ChevronDown, ChevronLeft, ChevronRight, ShieldAlert,
} from 'lucide-react';
import { NotificationBell } from '@/components/notification-bell';
import type { listNotificationsAction } from '@/app/actions/notifications';
import { Logomark, LogoLockup } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { selectIssuerAction } from '@/app/actions/context';
import { logoutAction } from '@/app/actions/auth';
import { updateLanguageAction } from '@/app/actions/tenant';
import { cn } from '@/lib/utils';
import type { Role, Permission } from '@/lib/rbac';
import { ROLE_PERMISSIONS } from '@/lib/rbac';

const navItems: Array<{
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  labelKey: 'dashboard' | 'documents' | 'clients' | 'catalog' | 'issuers' | 'users' | 'settings';
  requiresIssuer: boolean;
  permission: Permission | null;
}> = [
  { href: '/dashboard',  icon: LayoutDashboard, labelKey: 'dashboard', requiresIssuer: true,  permission: null },
  { href: '/documents',  icon: Files,           labelKey: 'documents', requiresIssuer: true,  permission: 'documents.read' },
  { href: '/clients',    icon: Users,           labelKey: 'clients',   requiresIssuer: true,  permission: 'clients.manage' },
  { href: '/catalog',    icon: Package,         labelKey: 'catalog',   requiresIssuer: true,  permission: 'catalog.manage' },
  { href: '/issuers',    icon: Building2,       labelKey: 'issuers',   requiresIssuer: false, permission: 'issuers.read' },
  { href: '/users',      icon: UsersRound,      labelKey: 'users',     requiresIssuer: false, permission: 'users.read' },
  { href: '/settings',   icon: Settings,        labelKey: 'settings',  requiresIssuer: false, permission: null },
];

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
  userFirstName: string | null;
  userLastName: string | null;
  userRole: Role;
  noIssuerAssigned: boolean;
  initialUnreadCount: number;
  initialNotifications: NotificationItem[];
  appVersion: string;
}

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName) {
    return `${firstName[0]}${lastName ? lastName[0] : ''}`.toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function getDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : email;
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
  userRole,
  noIssuerAssigned,
  onClose,
}: {
  currentIssuer: Issuer | null;
  issuers: Issuer[];
  userRole: Role;
  noIssuerAssigned: boolean;
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

  if (noIssuerAssigned) {
    return (
      <div className="mt-1 flex items-start gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs text-amber-400 leading-snug">{t('noIssuerAssigned')}</p>
          <p className="text-[10px] text-sidebar-foreground/50 leading-snug">{t('contactAdmin')}</p>
        </div>
      </div>
    );
  }

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
          ? `${currentIssuer.branchCode}-${currentIssuer.issuePointCode} ${currentIssuer.name}`
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
        <span className="truncate">
          {currentIssuer
            ? `${currentIssuer.branchCode}-${currentIssuer.issuePointCode} ${currentIssuer.name}`
            : t('noIssuer')}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-45 rounded-lg border border-sidebar-border bg-sidebar shadow-lg">
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

// ── Nav ───────────────────────────────────────────────────────────────────────

export function Nav({
  hasIssuer,
  environment,
  tenantName,
  currentIssuer,
  issuers,
  userEmail,
  userFirstName,
  userLastName,
  userRole,
  noIssuerAssigned,
  initialUnreadCount,
  initialNotifications,
  appVersion,
}: NavProps) {
  const t = useTranslations('nav');
  const tUsers = useTranslations('users');
  const pathname = usePathname();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('nav-collapsed') === 'true';
  });
  const [hovered, setHovered] = useState(false);

  const isExpanded = !collapsed || hovered;
  const roleLabel = tUsers(`role.${userRole}` as Parameters<typeof tUsers>[0]);
  const initials = getInitials(userFirstName, userLastName, userEmail);
  const displayName = getDisplayName(userFirstName, userLastName, userEmail);

  const userPerms = ROLE_PERMISSIONS[userRole];
  const visibleNavItems = navItems.filter(({ requiresIssuer, permission }) =>
    (!requiresIssuer || hasIssuer) && (!permission || userPerms.has(permission)),
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    if (!next) setHovered(false); // locking open — clear hover state
    if (typeof window !== 'undefined') {
      localStorage.setItem('nav-collapsed', String(next));
    }
  }

  function handleLocaleChange(code: string) {
    if (code === locale) return;
    updateLanguageAction(code).catch(() => {});
    const query = searchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { locale: code as 'es' | 'en' });
  }

  // Shared nav link list used by both mobile drawer and desktop sidebar
  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <ul className="flex flex-col gap-0.5">
        {visibleNavItems.map(({ href, icon: Icon, labelKey }) => {
          const isActive = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                title={!isExpanded ? t(labelKey) : undefined}
                onClick={onNavigate}
                className={cn(
                  'flex items-center rounded-md transition-colors',
                  isExpanded
                    ? 'gap-2.5 px-3 py-2 text-sm'
                    : 'justify-center py-2.5',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {isExpanded && <span className="truncate">{t(labelKey)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
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
              userRole={userRole}
              noIssuerAssigned={noIssuerAssigned}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
        <NotificationBell
          initialUnreadCount={initialUnreadCount}
          initialNotifications={initialNotifications}
        />
      </div>

      {/* ── Mobile backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Mobile drawer ── */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border md:hidden',
          'transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile drawer header */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
          <LogoLockup className="h-7 w-auto flex-1 min-w-0" />
        </div>

        {/* Mobile tenant + issuer */}
        <div className="border-b border-sidebar-border px-4 py-3">
          <TenantBadge name={tenantName} environment={environment} />
          <IssuerSwitcher
            currentIssuer={currentIssuer}
            issuers={issuers}
            userRole={userRole}
            noIssuerAssigned={noIssuerAssigned}
            onClose={() => setMobileOpen(false)}
          />
        </div>

        {/* Mobile nav links */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <NavLinks onNavigate={() => setMobileOpen(false)} />
        </div>

        {/* Mobile user footer */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 shrink-0 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs font-semibold text-sidebar-primary select-none">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-foreground">{displayName}</p>
              <span className="mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-sidebar-primary/15 text-sidebar-primary">
                {roleLabel}
              </span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title={t('signOut')}
                className="rounded-md p-1.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </form>
          </div>

          {/* Language + theme — mobile only, not in desktop sidebar */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-0.5" title={t('languageTooltip')}>
              <Globe className="h-3.5 w-3.5 text-sidebar-foreground/40 mr-0.5" aria-hidden />
              {locales.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => handleLocaleChange(code)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs transition-colors',
                    locale === code
                      ? 'font-semibold text-sidebar-foreground'
                      : 'text-sidebar-foreground/40 hover:text-sidebar-foreground/70'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </div>

        <p className="px-3 pb-2 text-center text-[10px] text-sidebar-foreground/30">v{appVersion}</p>
      </nav>

      {/* ── Desktop sidebar ── */}
      {/* Outer div is the layout spacer — width changes on lock/unlock */}
      <div
        className={cn(
          'relative hidden md:block shrink-0 transition-[width] duration-200',
          collapsed ? 'w-14' : 'w-64'
        )}
      >
        {/* Inner nav is absolute so hover-expand can overlay content */}
        <nav
          aria-label="Navegación principal"
          className={cn(
            'absolute inset-y-0 left-0 flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden',
            'transition-[width] duration-200',
            collapsed && hovered
              ? 'w-64 shadow-2xl z-50'
              : collapsed
              ? 'w-14'
              : 'w-64'
          )}
          onMouseEnter={() => collapsed && setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Desktop header */}
          <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-3">
            {isExpanded ? (
              <>
                <LogoLockup className="h-7 w-auto flex-1 min-w-0" />
                <button
                  onClick={toggleCollapsed}
                  title={collapsed ? t('lockSidebar') : t('collapseSidebar')}
                  className="ml-2 shrink-0 rounded-md p-1.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                >
                  {collapsed
                    ? <ChevronRight className="h-4 w-4" aria-hidden />
                    : <ChevronLeft className="h-4 w-4" aria-hidden />
                  }
                </button>
              </>
            ) : (
              <div className="flex w-full justify-center">
                <Logomark className="h-7 w-7" />
              </div>
            )}
          </div>

          {/* Desktop tenant + issuer */}
          {isExpanded ? (
            <div className="border-b border-sidebar-border px-4 py-3">
              <TenantBadge name={tenantName} environment={environment} />
              <IssuerSwitcher
                currentIssuer={currentIssuer}
                issuers={issuers}
                userRole={userRole}
                noIssuerAssigned={noIssuerAssigned}
              />
            </div>
          ) : (
            <div className="border-b border-sidebar-border flex flex-col items-center gap-1 py-2.5">
              <Building2 className="h-4 w-4 text-sidebar-foreground/40" aria-hidden />
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  environment === 'production' ? 'bg-green-500' : 'bg-amber-400'
                )}
              />
            </div>
          )}

          {/* Desktop nav links */}
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <NavLinks />
          </div>

          {/* Desktop user footer */}
          <div className="border-t border-sidebar-border px-3 py-3">
            {isExpanded ? (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs font-semibold text-sidebar-primary select-none">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">{displayName}</p>
                  <span className="mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-sidebar-primary/15 text-sidebar-primary">
                    {roleLabel}
                  </span>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    title={t('signOut')}
                    className="rounded-md p-1.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="h-8 w-8 shrink-0 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs font-semibold text-sidebar-primary select-none"
                  title={displayName}
                >
                  {initials}
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    title={t('signOut')}
                    className="rounded-md p-1.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </form>
              </div>
            )}
          </div>

          {isExpanded && (
            <p className="pb-2 text-center text-[10px] text-sidebar-foreground/30">v{appVersion}</p>
          )}
        </nav>
      </div>
    </>
  );
}
