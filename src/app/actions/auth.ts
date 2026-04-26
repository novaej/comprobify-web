'use server';

import bcrypt from 'bcryptjs';
import { signIn } from '@/auth';
import { db } from '@/lib/db';
import { AuthError } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

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
  redirect({ href: '/dashboard', locale });
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
    // If sign-in fails for any reason, send to login
    const locale = await getLocale();
    redirect({ href: '/login', locale });
    return null;
  }

  const locale = await getLocale();
  redirect({ href: '/settings', locale });
  return null;
}
