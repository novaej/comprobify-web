'use server';

import bcrypt from 'bcryptjs';
import { signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { AuthError } from 'next-auth';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { writeCtxCookie, clearCtxCookie } from '@/lib/context-cookie';
import { sendMail } from '@/lib/mailgun';
import { issueVerificationToken, checkVerificationToken, consumeVerificationToken } from '@/lib/verification-token';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';
import * as Sentry from '@sentry/nextjs';
import { confirmEmailVerification } from '@/lib/public-api';
import { ApiError } from '@/lib/errors';

export type AuthResult = { error: string } | null;

export async function loginAction(email: string, password: string): Promise<AuthResult> {
  const locale = await getLocale();

  // Pre-check: invited users with no password cannot authenticate via signIn
  // (authorize() returns null for missing passwordHash). Redirect them to set
  // their password before we even attempt a credential check.
  const preCheck = await db.user.findUnique({
    where: { email },
    select: { id: true, inviteStatus: true, passwordHash: true, active: true },
  });
  if (preCheck && !preCheck.active) {
    return { error: 'ACCOUNT_DISABLED' };
  }
  if (preCheck?.inviteStatus === 'INVITED' && !preCheck.passwordHash) {
    // Mint a fresh invite token rather than assuming the original emailed one
    // is still valid (it may have expired, or already been superseded by a
    // resend) — issueVerificationToken supersedes any prior unconsumed one,
    // so this is always safe to call.
    const token = await issueVerificationToken(preCheck.id, 'INVITE');
    const params = new URLSearchParams({ token });
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
      id: true,
      tenantId: true,
      role: true,
      inviteStatus: true,
      isSuperAdmin: true,
      tenant: { select: { _count: { select: { issuers: { where: { active: true } } } } } },
    },
  });

  if (user?.isSuperAdmin) {
    redirect({ href: '/admin', locale });
    return null;
  }

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

  const totalIssuerCount = user.tenant._count.issuers;

  if (totalIssuerCount === 0) {
    redirect({ href: '/issuers?empty=true', locale });
    return null;
  }

  const isAdminLike = user.role === 'Owner' || user.role === 'Admin';

  // Non-admin/owner users never see the issuer picker — auto-select their first assigned issuer.
  // If no assignment exists yet, send them to the dedicated no-issuer page.
  if (!isAdminLike) {
    const access = await db.userIssuerAccess.findMany({
      where: { userId: user.id, issuer: { active: true } },
      select: { issuerId: true },
      take: 1,
    });
    if (access.length === 0) {
      redirect({ href: '/no-issuer-assigned', locale });
      return null;
    }
    await writeCtxCookie({ issuerId: access[0].issuerId, v: 2 });
    redirect({ href: '/dashboard', locale });
    return null;
  }

  // Admin/Owner: auto-select when there is only one issuer, show picker for multiple.
  if (totalIssuerCount === 1) {
    const issuer = await db.issuer.findFirst({
      where: { tenantId: user.tenantId, active: true },
      select: { id: true },
    });
    if (issuer) await writeCtxCookie({ issuerId: issuer.id, v: 2 });
    redirect({ href: '/dashboard', locale });
    return null;
  }

  redirect({ href: '/issuer/select', locale });
  return null;
}

/**
 * Read-only check for whether an invite token currently resolves to a
 * pending invite — used by /complete-registration to decide what to render
 * on page load, and to display the target email (never trusted from the
 * client), mirroring checkResetTokenValid's page-load pattern. Does not
 * consume the token — see CLAUDE.md Common Mistake #47.
 */
export async function checkInviteToken(token: string): Promise<{ email: string } | null> {
  const result = await checkVerificationToken(token, 'INVITE');
  if (!result) return null;
  const user = await db.user.findUnique({
    where: { id: result.userId },
    select: { email: true, inviteStatus: true, passwordHash: true },
  });
  if (!user || user.inviteStatus !== 'INVITED' || user.passwordHash) return null;
  return { email: user.email };
}

/**
 * Complete the registration of an invited user.
 * - Consumes the invite token to resolve identity (never trusts a
 *   client-supplied email — the token is the only proof of ownership).
 * - Validates the user still has inviteStatus === 'INVITED' and no password.
 * - Hashes and saves the password, marks the account ACTIVE.
 * - Signs the user in and redirects to the appropriate page.
 */
export async function completeRegistrationAction(
  token: string,
  password: string,
): Promise<AuthResult> {
  const locale = await getLocale();

  const consumed = await consumeVerificationToken(token, 'INVITE');
  if (!consumed) return { error: 'INVALID_OR_EXPIRED_INVITE' };

  const user = await db.user.findUnique({
    where: { id: consumed.userId },
    select: { id: true, email: true, inviteStatus: true, passwordHash: true },
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
      emailVerified: true,  // invite link sent to their address proves ownership
    },
  });

  try {
    await signIn('credentials', { email: user.email, password, redirect: false });
  } catch (err) {
    // Should not happen — we just set the password. Fall back to login page.
    Sentry.captureException(err, { extra: { email: user.email } });
    redirect({ href: '/login', locale });
    return null;
  }

  return postLoginRedirect(user.email, locale);
}

/**
 * Best-effort password reset email — a delivery failure must not reveal
 * whether the account exists, so callers always get the same generic result.
 */
async function sendPasswordResetRequestEmail(email: string, token: string) {
  try {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'email.forgotPassword' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not configured');

    const link = `${appUrl}/${locale}/reset-password?token=${token}`;
    const subject = t('subject');
    const text = `${t('greeting')}\n\n${t('cta')}\n\n${link}`;
    const html = `<p>${t('greeting')}</p><p>${t('cta')}</p><p><a href="${link}">${link}</a></p>`;

    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    Sentry.captureException(err, { extra: { email } });
  }
}

/**
 * Request a password reset link. Deliberately anti-enumeration (mirrors
 * recoverAccountAction's genericMessage pattern): whether the email matches
 * an active, password-holding account is never observable from the result —
 * only from whether an email eventually arrives.
 */
export async function requestPasswordResetAction(email: string): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { error: 'EMAIL_REQUIRED' };

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, passwordHash: true, active: true, inviteStatus: true },
  });

  // Only accounts that already have a password to reset are eligible — an
  // invited-but-not-yet-activated user should use their invite link instead,
  // and a disabled account shouldn't be reachable via self-service at all.
  // None of this is ever surfaced in the response.
  if (user && user.passwordHash && user.active && user.inviteStatus === 'ACTIVE') {
    const rawToken = await issueVerificationToken(user.id, 'PASSWORD_RESET');
    await sendPasswordResetRequestEmail(normalizedEmail, rawToken);
  }

  return null;
}

/**
 * Read-only check for whether a reset token currently resolves to an
 * unexpired, unconsumed reset — used by /reset-password to decide what to
 * render on page load ("invalid link" vs. the form) instead of only
 * surfacing INVALID_OR_EXPIRED_RESET_TOKEN once the user submits. Mutates
 * nothing; resetPasswordAction re-validates the same way at submit time
 * regardless, so this is purely a rendering decision, not the security check.
 */
export async function checkResetTokenValid(token: string): Promise<boolean> {
  const result = await checkVerificationToken(token, 'PASSWORD_RESET');
  if (!result) return false;
  const user = await db.user.findUnique({ where: { id: result.userId }, select: { active: true } });
  return Boolean(user?.active);
}

/**
 * Complete a self-service password reset.
 * - Consumes the token to resolve identity.
 * - Hashes and saves the new password.
 * - Signs the user in and redirects to the appropriate page.
 */
export async function resetPasswordAction(token: string, password: string): Promise<AuthResult> {
  const locale = await getLocale();

  const consumed = await consumeVerificationToken(token, 'PASSWORD_RESET');
  if (!consumed) return { error: 'INVALID_OR_EXPIRED_RESET_TOKEN' };

  const user = await db.user.findUnique({
    where: { id: consumed.userId },
    select: { id: true, email: true, active: true },
  });

  if (!user || !user.active) {
    return { error: 'INVALID_OR_EXPIRED_RESET_TOKEN' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  try {
    await signIn('credentials', { email: user.email, password, redirect: false });
  } catch (err) {
    // Should not happen — we just set the password. Fall back to login page.
    Sentry.captureException(err, { extra: { email: user.email } });
    redirect({ href: '/login', locale });
    return null;
  }

  return postLoginRedirect(user.email, locale);
}

/**
 * The consuming half of email verification — only ever called from an
 * explicit user click (the "Confirmar mi correo" button on /verify-email),
 * never from page render. This is what makes the flow safe against email
 * link-scanners that prefetch the link with an automated GET: their prefetch
 * only ever reaches the read-only check, never this action.
 */
export async function confirmEmailVerificationAction(token: string): Promise<{ error?: string }> {
  try {
    const { email } = await confirmEmailVerification(token);
    await db.user.updateMany({ where: { email }, data: { emailVerified: true } });
    return {};
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return { error: err.code };
  }
}

export async function registerAction(
  email: string,
  password: string,
  intendedTier?: PaidTier,
  intendedBillingInterval?: BillingInterval,
): Promise<AuthResult> {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: 'EMAIL_TAKEN' };

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.create({ data: { email, passwordHash } });

  // Sign in immediately after registration
  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch (err) {
    Sentry.captureException(err, { extra: { email } });
    const locale = await getLocale();
    redirect({ href: '/login', locale });
    return null;
  }

  const locale = await getLocale();
  const onboardingHref = intendedTier
    ? `/onboarding/tenant?tier=${intendedTier}&interval=${intendedBillingInterval ?? 'MONTHLY'}`
    : '/onboarding/tenant';
  redirect({ href: onboardingHref, locale });
  return null;
}

export async function logoutAction(): Promise<void> {
  await clearCtxCookie();
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}/login` });
}
