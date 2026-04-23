import { redirect } from 'next/navigation';

// Locale root (e.g. /es) — redirect to the dashboard.
// Uses next/navigation redirect here because we want to preserve the locale prefix
// (the proxy/middleware has already set the locale on this request).
export default async function LocaleIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
