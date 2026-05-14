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

async function getLayoutProps(userId: string) {
  const user = await db.user.findUnique({
    where: { id: Number(userId) },
    select: {
      tenant: {
        select: {
          environment: true,
          _count: { select: { issuers: true } },
        },
      },
    },
  });
  if (!user?.tenant) return { hasIssuer: false, environment: 'sandbox' as const };
  return {
    hasIssuer: user.tenant._count.issuers > 0,
    environment: user.tenant.environment as 'sandbox' | 'production',
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

  const layoutProps = isAuthenticated
    ? await getLayoutProps(session.user.id)
    : null;

  return (
    <NextIntlClientProvider messages={messages}>
      <QueryProvider>
        {isAuthenticated && layoutProps ? (
          <div className="flex h-full flex-col md:flex-row">
            <Nav hasIssuer={layoutProps.hasIssuer} />
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
