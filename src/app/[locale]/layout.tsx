import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { QueryProvider } from '@/providers/query-provider';
import { Nav } from '@/components/nav';
import { Toaster } from '@/components/ui/sonner';
import { SandboxBanner } from '@/components/sandbox-banner';
import { StagingDeploymentBanner } from '@/components/staging-deployment-banner';
import { SuspendedBanner } from '@/components/suspended-banner';
import { CertExpiryBanner } from '@/components/cert-expiry-banner';
import { AgreementPendingBanner } from '@/components/agreement-pending-banner';
import { NotificationSync } from '@/components/notification-sync';
import { TopBar } from '@/components/top-bar';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/utils';
import type { Role } from '@/lib/rbac';
import { readCtxCookie } from '@/lib/context-cookie';
import type { listNotificationsAction } from '@/app/actions/notifications';
import packageJson from '../../../package.json';

type NotificationItem = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

const BILLING_NOTIFICATION_TYPES = [
  'PAYMENT_VERIFIED', 'PAYMENT_REJECTED',
  'SUBSCRIPTION_RENEWAL_DUE', 'SUBSCRIPTION_EXPIRED',
];

interface CertAlertProps {
  id: string;
  type: 'CERT_EXPIRING' | 'CERT_EXPIRED';
  title: string;
  message: string;
}

interface LayoutProps {
  hasIssuer: boolean;
  environment: 'sandbox' | 'production';
  isSuspended: boolean;
  tenantName: string | null;
  currentIssuer: { id: string; apiIssuerId: string; name: string; branchCode: string; issuePointCode: string } | null;
  issuers: Array<{ id: string; apiIssuerId: string; name: string; branchCode: string; issuePointCode: string }>;
  userEmail: string;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: Role;
  noIssuerAssigned: boolean;
  initialUnreadCount: number;
  initialNotifications: NotificationItem[];
  certAlert: CertAlertProps | null;
}

async function getLayoutProps(userId: string): Promise<LayoutProps | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      acceptedAt: true,
      invitedAt: true,
      tenant: {
        select: {
          id: true,
          businessName: true,
          tradeName: true,
          environment: true,
          status: true,
          issuers: {
            where: { active: true },
            orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
            select: { id: true, apiIssuerId: true, businessName: true, tradeName: true, branchCode: true, issuePointCode: true },
          },
        },
      },
    },
  });

  if (!user?.active || !user?.tenant) return null;

  const ctxCookie = await readCtxCookie();
  const allIssuers = user.tenant.issuers.map((i) => ({
    id: i.id,
    apiIssuerId: i.apiIssuerId,
    name: i.tradeName ?? i.businessName,
    branchCode: i.branchCode,
    issuePointCode: i.issuePointCode,
  }));

  // For non-Owner/Admin, restrict the issuer switcher to only assigned issuers.
  const isOwnerOrAdmin = user.role === 'Owner' || user.role === 'Admin';
  let displayIssuers = allIssuers;
  let noIssuerAssigned = false;
  if (!isOwnerOrAdmin) {
    const userAccess = await db.userIssuerAccess.findMany({
      where: { tenantId: user.tenant.id, userId: userId },
      select: { issuerId: true },
    });
    if (userAccess.length === 0) {
      noIssuerAssigned = true;
      displayIssuers = [];
    } else {
      const assignedIds = new Set(userAccess.map((a) => a.issuerId));
      displayIssuers = allIssuers.filter((i) => assignedIds.has(i.id));
    }
  }

  const currentIssuer = ctxCookie
    ? (displayIssuers.find((i) => i.id === ctxCookie.issuerId) ?? allIssuers.find((i) => i.id === ctxCookie.issuerId) ?? null)
    : null;

  // Fetch active notifications with per-user read state.
  // Non-fatal — use empty array on failure.
  const tenantId = user.tenant.id;
  const joinedAt = user.acceptedAt ?? user.invitedAt;
  const canSeeBilling = user.role === 'Owner' || user.role === 'Admin';
  const notifications = await db.notification
    .findMany({
      where: {
        tenantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(joinedAt ? { apiCreatedAt: { gte: joinedAt } } : {}),
        ...(!canSeeBilling ? { type: { notIn: BILLING_NOTIFICATION_TYPES } } : {}),
      },
      orderBy: { apiCreatedAt: 'desc' as const },
      take: 20,
      include: {
        reads: { where: { userId: userId }, select: { userId: true } },
      },
    })
    .catch(() => [] as Array<{
      id: string; tenantId: string; apiNotificationId: string;
      type: string; severity: string; title: string; message: string;
      // issuerId stays a number here: it is the API-side issuer id, not a local FK.
      metadata: unknown; issuerId: string | null;
      apiReadAt: Date | null; expiresAt: Date | null; apiCreatedAt: Date; syncedAt: Date;
      reads: Array<{ userId: string }>;
    }>);

  const mappedNotifications: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    apiNotificationId: n.apiNotificationId,
    type: n.type,
    severity: n.severity,
    title: n.title,
    message: n.message,
    metadata: n.metadata,
    issuerId: n.issuerId,
    readByMe: n.reads.length > 0 || n.apiReadAt !== null,
    apiReadAt: n.apiReadAt,
    expiresAt: n.expiresAt,
    apiCreatedAt: n.apiCreatedAt,
  }));

  const initialUnreadCount = mappedNotifications.filter((n) => !n.readByMe).length;

  // Find the most urgent unread cert alert for the current issuer (or any issuer if none selected).
  const certTypes = ['CERT_EXPIRED', 'CERT_EXPIRING'] as const;
  const certAlert: CertAlertProps | null = (() => {
    for (const certType of certTypes) {
      const match = mappedNotifications.find(
        (n) =>
          !n.readByMe &&
          n.type === certType &&
          (n.issuerId === null ||
            currentIssuer == null ||
            n.issuerId === currentIssuer.apiIssuerId),
      );
      if (match) {
        return { id: match.id, type: certType, title: match.title, message: match.message };
      }
    }
    return null;
  })();

  return {
    hasIssuer: displayIssuers.length > 0,
    environment: user.tenant.environment as 'sandbox' | 'production',
    isSuspended: user.tenant.status === 'SUSPENDED',
    tenantName: user.tenant.businessName,
    currentIssuer,
    issuers: displayIssuers,
    userEmail: user.email,
    userFirstName: user.firstName,
    userLastName: user.lastName,
    userRole: user.role as Role,
    noIssuerAssigned,
    initialUnreadCount,
    initialNotifications: mappedNotifications,
    certAlert,
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // Marketing pages ((marketing)/page.tsx, /pricing) nest inside this layout but must
  // never get the authenticated Nav/TopBar shell, even when logged in — a child layout
  // can't opt out of markup its parent already wrapped it in, so proxy.ts tells us which
  // route we're rendering via this header. See src/proxy.ts's MARKETING_ROUTE_HEADER.
  const requestHeaders = await headers();
  const isMarketingRoute = requestHeaders.get('x-marketing-route') === '1';
  // Same reasoning for recover-account/forgot-password/reset-password: they deliberately
  // render for an already-authenticated visitor too (see src/proxy.ts's
  // STANDALONE_ROUTE_HEADER), so they need the same escape from the Nav wrap.
  const isStandaloneRoute = requestHeaders.get('x-standalone-route') === '1';

  const [messages, session] = await Promise.all([getMessages(), auth()]);
  const isAuthenticated = !isMarketingRoute && !isStandaloneRoute && !!session;

  const layoutProps =
    isAuthenticated && isUuid(session.user.id) ? await getLayoutProps(session.user.id) : null;

  return (
    <NextIntlClientProvider messages={messages}>
      <QueryProvider>
        {isAuthenticated && layoutProps ? (
          <div className="flex h-full flex-col md:flex-row">
            <Nav
              hasIssuer={layoutProps.hasIssuer}
              environment={layoutProps.environment}
              tenantName={layoutProps.tenantName}
              currentIssuer={layoutProps.currentIssuer}
              issuers={layoutProps.issuers}
              userEmail={layoutProps.userEmail}
              userFirstName={layoutProps.userFirstName}
              userLastName={layoutProps.userLastName}
              userRole={layoutProps.userRole}
              noIssuerAssigned={layoutProps.noIssuerAssigned}
              initialUnreadCount={layoutProps.initialUnreadCount}
              initialNotifications={layoutProps.initialNotifications}
              appVersion={packageJson.version}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TopBar
                initialUnreadCount={layoutProps.initialUnreadCount}
                initialNotifications={layoutProps.initialNotifications}
              />
              <NotificationSync />
              <main className="flex-1 overflow-y-auto p-4 md:p-8">
                <SuspendedBanner isSuspended={layoutProps.isSuspended} />
                <StagingDeploymentBanner />
                <SandboxBanner environment={layoutProps.environment} />
                {layoutProps.certAlert && (
                  <CertExpiryBanner
                    id={layoutProps.certAlert.id}
                    type={layoutProps.certAlert.type}
                    title={layoutProps.certAlert.title}
                    message={layoutProps.certAlert.message}
                  />
                )}
                <AgreementPendingBanner />
                {children}
              </main>
            </div>
          </div>
        ) : (
          <>{children}</>
        )}
        <Toaster />
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
