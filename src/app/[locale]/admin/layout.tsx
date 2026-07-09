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
    <div className="flex h-full flex-col md:flex-row">
      <AdminNav userEmail={ctx.user.email} />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
