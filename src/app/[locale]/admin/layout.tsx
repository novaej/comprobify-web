import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { AdminNav } from '@/components/admin-nav';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireSuperAdmin();

  return (
    <div className="min-h-full">
      <AdminNav userEmail={ctx.user.email} />
      <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
