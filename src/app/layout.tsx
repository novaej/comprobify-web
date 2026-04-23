import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { getLocale } from 'next-intl/server';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Comprobify',
  description: 'Facturación electrónica SRI — Ecuador',
};

// Root layout: provides html/body with dynamic lang attribute from next-intl.
// All layout UI (nav, providers) lives in [locale]/layout.tsx.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${geistSans.variable} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
