'use server';

import bcrypt from 'bcryptjs';
import { signIn } from '@/auth';
import { db } from '@/lib/db';
import { AuthError } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { writeCtxCookie } from '@/lib/context-cookie';

export type AuthResult = { error: string } | null;

export async function loginAction(email: string, password: string): Promise<AuthResult> {
  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'INVALID_CREDENTIALS' };
    }
    throw err;
  }

  const locale = await getLocale();

  const user = await db.user.findUnique({
    where: { email },
    select: {
      tenantId: true,
      role: true,
      inviteStatus: true,
      passwordHash: true,
      tenant: { select: { _count: { select: { issuers: true } } } },
    },
  });

  // Invited user who hasn't set a password yet → complete registration
  if (user?.inviteStatus === 'INVITED' && !user.passwordHash) {
    redirect({ href: '/complete-registration', locale });
    return null;
  }

  // No tenant yet → onboarding
  if (!user?.tenantId || !user.tenant) {
    redirect({ href: '/onboarding/tenant', locale });
    return null;
  }

  const issuerCount = user.tenant._count.issuers;

  if (issuerCount === 0) {
    // Orphan tenant (Owner/Admin only path) — no issuers exist yet
    redirect({ href: '/issuers?empty=true', locale });
    return null;
  }

  if (issuerCount === 1) {
    // Auto-select the single issuer and go straight to dashboard
    const issuer = await db.issuer.findFirst({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    if (issuer) {
      await writeCtxCookie({ issuerId: issuer.id, v: 1 });
    }
    redirect({ href: '/dashboard', locale });
    return null;
  }

  // Multiple issuers → let the user pick
  redirect({ href: '/issuer/select', locale });
  return null;
}

export async function registerAction(email: string, password: string): Promise<AuthResult> {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: 'EMAIL_TAKEN' };

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.create({ data: { email, passwordHash } });

  // Sign in immediately after registration
  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch {
    const locale = await getLocale();
    redirect({ href: '/login', locale });
    return null;
  }

  const locale = await getLocale();
  redirect({ href: '/onboarding/tenant', locale });
  return null;
}
