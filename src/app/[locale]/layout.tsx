import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { QueryProvider } from '@/providers/query-provider';
import { Nav } from '@/components/nav';
import { Toaster } from '@/components/ui/sonner';
import { SandboxBanner } from '@/components/sandbox-banner';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { readCtxCookie } from '@/lib/context-cookie';

interface LayoutProps {
  hasIssuer: boolean;
  environment: 'sandbox' | 'production';
  tenantName: string | null;
  currentIssuer: { id: number; name: string; branchCode: string; issuePointCode: string } | null;
  issuers: Array<{ id: number; name: string; branchCode: string; issuePointCode: string }>;
  userEmail: string;
}

async function getLayoutProps(userId: string): Promise<LayoutProps | null> {
  const user = await db.user.findUnique({
    where: { id: Number(userId) },
    select: {
      email: true,
      tenant: {
        select: {
          businessName: true,
          tradeName: true,
          environment: true,
          issuers: {
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: { id: true, businessName: true, tradeName: true, branchCode: true, issuePointCode: true },
          },
        },
      },
    },
  });

  if (!user?.tenant) return null;

  const ctxCookie = await readCtxCookie();
  const allIssuers = user.tenant.issuers.map((i) => ({
    id: i.id,
    name: i.tradeName ?? i.businessName,
    branchCode: i.branchCode,
    issuePointCode: i.issuePointCode,
  }));
  const currentIssuer = ctxCookie
    ? (allIssuers.find((i) => i.id === ctxCookie.issuerId) ?? null)
    : null;

  return {
    hasIssuer: allIssuers.length > 0,
    environment: user.tenant.environment as 'sandbox' | 'production',
    tenantName: user.tenant.tradeName ?? user.tenant.businessName,
    currentIssuer,
    issuers: allIssuers,
    userEmail: user.email,
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
            />
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
              <SandboxBanner environment={layoutProps.environment} />
              {children}
            </main>
          </div>
        ) : (
          <main className="flex-1">{children}</main>
        )}
        <Toaster />
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
