'use server';

import bcrypt from 'bcryptjs';
import { signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { AuthError } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { writeCtxCookie, clearCtxCookie } from '@/lib/context-cookie';

export type AuthResult = { error: string } | null;

export async function loginAction(email: string, password: string): Promise<AuthResult> {
  const locale = await getLocale();

  // Pre-check: invited users with no password cannot authenticate via signIn
  // (authorize() returns null for missing passwordHash). Redirect them to set
  // their password before we even attempt a credential check.
  const preCheck = await db.user.findUnique({
    where: { email },
    select: { inviteStatus: true, passwordHash: true },
  });
  if (preCheck?.inviteStatus === 'INVITED' && !preCheck.passwordHash) {
    const params = new URLSearchParams({ email });
    redirect({ href: `/complete-registration?${params}`, locale });
    return null;
  }

  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'INVALID_CREDENTIALS' };
    }
    throw err;
  }

  return postLoginRedirect(email, locale);
}

/** Shared post-login redirect logic used by loginAction and completeRegistrationAction. */
async function postLoginRedirect(email: string, locale: string): Promise<null> {
  const user = await db.user.findUnique({
    where: { email },
    select: {
      tenantId: true,
      inviteStatus: true,
      tenant: { select: { _count: { select: { issuers: true } } } },
    },
  });

  // Shouldn't happen after a successful sign-in, but guard anyway.
  if (user?.inviteStatus !== 'ACTIVE') {
    redirect({ href: '/complete-registration', locale });
    return null;
  }

  // No tenant yet → onboarding
  if (!user.tenantId || !user.tenant) {
    redirect({ href: '/onboarding/tenant', locale });
    return null;
  }

  const issuerCount = user.tenant._count.issuers;

  if (issuerCount === 0) {
    redirect({ href: '/issuers?empty=true', locale });
    return null;
  }

  if (issuerCount === 1) {
    const issuer = await db.issuer.findFirst({
      where: { tenantId: user.tenantId! },
      select: { id: true },
    });
    if (issuer) await writeCtxCookie({ issuerId: issuer.id, v: 1 });
    redirect({ href: '/dashboard', locale });
    return null;
  }

  redirect({ href: '/issuer/select', locale });
  return null;
}

/**
 * Complete the registration of an invited user.
 * - Validates the user exists with inviteStatus === 'INVITED' and no password.
 * - Hashes and saves the password, marks the account ACTIVE.
 * - Signs the user in and redirects to the appropriate page.
 */
export async function completeRegistrationAction(
  email: string,
  password: string,
): Promise<AuthResult> {
  const locale = await getLocale();

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, inviteStatus: true, passwordHash: true },
  });

  if (!user || user.inviteStatus !== 'INVITED' || user.passwordHash) {
    return { error: 'INVALID_OR_EXPIRED_INVITE' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      inviteStatus: 'ACTIVE',
      acceptedAt: new Date(),
    },
  });

  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch {
    // Should not happen — we just set the password. Fall back to login page.
    redirect({ href: '/login', locale });
    return null;
  }

  return postLoginRedirect(email, locale);
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

export async function logoutAction(): Promise<void> {
  await clearCtxCookie();
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}/login` });
}
