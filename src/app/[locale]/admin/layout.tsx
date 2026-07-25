import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { auth } from '@/auth';
import { AdminNav } from '@/components/admin-nav';
import { AuthSessionProvider } from '@/providers/auth-session-provider';
import { IdleActivityTracker } from '@/components/idle-activity-tracker';
import { DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES } from '@/lib/session-timeout';

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
  // requireSuperAdmin() doesn't return the raw Session — needed here only to
  // seed AuthSessionProvider so IdleActivityTracker can heartbeat (see
  // CLAUDE.md's "Per-tenant session idle timeout" pattern).
  const session = await auth();

  return (
    <AuthSessionProvider session={session}>
      {/* Super admins have no Tenant row to hold a configured timeout, so
          this always uses the system default (see session-timeout.ts). */}
      <IdleActivityTracker idleTimeoutMinutes={DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES} locale={locale} />
      <div className="flex h-full flex-col md:flex-row">
        <AdminNav userEmail={ctx.user.email} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </AuthSessionProvider>
  );
}
