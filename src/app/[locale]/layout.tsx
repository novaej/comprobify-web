import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { QueryProvider } from '@/providers/query-provider';
import { Nav } from '@/components/nav';
import { Toaster } from '@/components/ui/sonner';
import { SandboxBanner } from '@/components/sandbox-banner';
import { auth } from '@/auth';

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

  return (
    <NextIntlClientProvider messages={messages}>
      <QueryProvider>
        {isAuthenticated ? (
          <div className="flex h-full flex-col md:flex-row">
            <Nav hasIssuer={session.user.hasIssuer} />
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
              <SandboxBanner environment={session.user.environment} />
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
