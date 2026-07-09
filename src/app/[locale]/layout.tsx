import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { QueryProvider } from '@/providers/query-provider';
import { Nav } from '@/components/nav';
import { Toaster } from '@/components/ui/sonner';
import { SandboxBanner } from '@/components/sandbox-banner';
import { SuspendedBanner } from '@/components/suspended-banner';
import { CertExpiryBanner } from '@/components/cert-expiry-banner';
import { NotificationSync } from '@/components/notification-sync';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { readCtxCookie } from '@/lib/context-cookie';
import type { listNotificationsAction } from '@/app/actions/notifications';
import packageJson from '../../../package.json';

type NotificationItem = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

interface CertAlertProps {
  id: number;
  type: 'CERT_EXPIRING' | 'CERT_EXPIRED';
  title: string;
  message: string;
}

interface LayoutProps {
  hasIssuer: boolean;
  environment: 'sandbox' | 'production';
  isSuspended: boolean;
  tenantName: string | null;
  currentIssuer: { id: number; apiIssuerId: number; name: string; branchCode: string; issuePointCode: string } | null;
  issuers: Array<{ id: number; apiIssuerId: number; name: string; branchCode: string; issuePointCode: string }>;
  userEmail: string;
  initialUnreadCount: number;
  initialNotifications: NotificationItem[];
  certAlert: CertAlertProps | null;
}

async function getLayoutProps(userId: string): Promise<LayoutProps | null> {
  const userNum = Number(userId);

  const user = await db.user.findUnique({
    where: { id: userNum },
    select: {
      email: true,
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

  if (!user?.tenant) return null;

  const ctxCookie = await readCtxCookie();
  const allIssuers = user.tenant.issuers.map((i) => ({
    id: i.id,
    apiIssuerId: i.apiIssuerId,
    name: i.tradeName ?? i.businessName,
    branchCode: i.branchCode,
    issuePointCode: i.issuePointCode,
  }));
  const currentIssuer = ctxCookie
    ? (allIssuers.find((i) => i.id === ctxCookie.issuerId) ?? null)
    : null;

  // Fetch active notifications with per-user read state.
  // Non-fatal — use empty array on failure.
  const tenantId = user.tenant.id;
  const notifications = await db.notification
    .findMany({
      where: {
        tenantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { apiCreatedAt: 'desc' as const },
      take: 20,
      include: {
        reads: { where: { userId: userNum }, select: { userId: true } },
      },
    })
    .catch(() => [] as Array<{
      id: number; tenantId: number; apiNotificationId: string;
      type: string; severity: string; title: string; message: string;
      metadata: unknown; issuerId: number | null;
      apiReadAt: Date | null; expiresAt: Date | null; apiCreatedAt: Date; syncedAt: Date;
      reads: Array<{ userId: number }>;
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
    hasIssuer: allIssuers.length > 0,
    environment: user.tenant.environment as 'sandbox' | 'production',
    isSuspended: user.tenant.status === 'SUSPENDED',
    tenantName: user.tenant.tradeName ?? user.tenant.businessName,
    currentIssuer,
    issuers: allIssuers,
    userEmail: user.email,
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

  const [messages, session] = await Promise.all([getMessages(), auth()]);
  const isAuthenticated = !!session;

  const layoutProps = isAuthenticated ? await getLayoutProps(session.user.id) : null;

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
              initialUnreadCount={layoutProps.initialUnreadCount}
              initialNotifications={layoutProps.initialNotifications}
              appVersion={packageJson.version}
            />
            <NotificationSync />
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
              <SuspendedBanner isSuspended={layoutProps.isSuspended} />
              <SandboxBanner environment={layoutProps.environment} />
              {layoutProps.certAlert && (
                <CertExpiryBanner
                  id={layoutProps.certAlert.id}
                  type={layoutProps.certAlert.type}
                  title={layoutProps.certAlert.title}
                  message={layoutProps.certAlert.message}
                />
              )}
              {children}
            </main>
          </div>
        ) : (
          <>{children}</>
        )}
        <Toaster />
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
