import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { QueryProvider } from '@/providers/query-provider';
import { Nav } from '@/components/nav';
import { Toaster } from '@/components/ui/sonner';

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

  // Required for static rendering with next-intl
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <QueryProvider>
        <div className="flex h-full">
          <Nav />
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>
        <Toaster />
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
