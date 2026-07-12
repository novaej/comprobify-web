import 'server-only';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

export interface AdminContext {
  user: { id: number; email: string };
}

/**
 * Guard for /admin routes. Deliberately separate from requireContext() in
 * context.ts, which assumes a tenant always exists — a super admin has
 * tenantId = null and no role, so it can't reuse that function.
 */
export async function requireSuperAdmin(): Promise<AdminContext> {
  const locale = await getLocale();

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/login', locale });
    return null as never;
  }

  const user = await db.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { id: true, email: true, isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) {
    notFound();
  }

  return { user: { id: user.id, email: user.email } };
}
