'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { sendMail } from '@/lib/mailgun';
import * as Sentry from '@sentry/nextjs';
import { resolveApiKeyForRole } from '@/lib/tenant-api-key';
import { issueVerificationToken } from '@/lib/verification-token';
import type { Role } from '@/lib/rbac';

export type UsersResult = { error: string } | null;

function assertCanGrantRole(role: Role, callerRole: Role): UsersResult {
  if (role === 'Owner' && callerRole !== 'Owner') {
    return { error: 'ONLY_OWNER_CAN_GRANT_OWNER' };
  }
  return null;
}

/**
 * Mints (or reuses) the role's API key up front, at role-assignment time,
 * instead of leaving it to be created lazily on that user's first login —
 * see src/lib/tenant-api-key.ts's resolveApiKeyForRole. Best-effort: a
 * transient failure here (e.g. the Comprobify API being briefly unreachable)
 * must not block inviting or re-roling a user — requireContext()'s own call
 * into the same function is the fallback.
 */
async function ensureRoleApiKeyBestEffort(tenantId: string, environment: string, role: Role) {
  try {
    await resolveApiKeyForRole(tenantId, environment, role);
  } catch (err) {
    // Sentry is a no-op locally (no DSN), so log too — otherwise this
    // failure is invisible in dev.
    console.error('[users] ensureRoleApiKeyBestEffort failed', { tenantId, environment, role, err });
    Sentry.captureException(err, { extra: { tenantId, environment, role } });
  }
}

/** Best-effort invite email — a delivery failure must not block the invite itself. */
async function sendInviteEmail(email: string, businessName: string, token: string) {
  try {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'email.invite' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not configured');

    const link = `${appUrl}/${locale}/complete-registration?token=${token}`;
    const subject = t('subject', { businessName });
    const text = `${t('greeting', { businessName })}\n\n${t('cta')}\n\n${link}`;
    const html = `<p>${t('greeting', { businessName })}</p><p>${t('cta')}</p><p><a href="${link}">${link}</a></p>`;

    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    Sentry.captureException(err, { extra: { email } });
  }
}

export async function inviteUserAction(email: string, role: Role): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const grantError = assertCanGrantRole(role, ctx.user.role);
  if (grantError) return grantError;

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  let userId: string;
  if (existing) {
    if (existing.tenantId && existing.tenantId !== ctx.tenant.id) {
      return { error: 'USER_BELONGS_TO_ANOTHER_TENANT' };
    }
    if (existing.tenantId === ctx.tenant.id) return { error: 'USER_ALREADY_IN_TENANT' };
    // Existing user with no tenant — link them. passwordHash is reset even
    // though it may already be null (e.g. this user previously completed
    // registration elsewhere, then got removed via removeUserAction, which
    // clears tenantId/role but not passwordHash) — otherwise
    // completeRegistrationAction's `user.passwordHash` check rejects this
    // legitimate re-invite as INVALID_OR_EXPIRED_INVITE.
    await db.user.update({
      where: { id: existing.id },
      data: { tenantId: ctx.tenant.id, role, inviteStatus: 'INVITED', invitedAt: new Date(), passwordHash: null },
    });
    userId = existing.id;
  } else {
    const created = await db.user.create({
      data: {
        email: normalizedEmail,
        tenantId: ctx.tenant.id,
        role,
        inviteStatus: 'INVITED',
        invitedAt: new Date(),
      },
    });
    userId = created.id;
  }

  await ensureRoleApiKeyBestEffort(ctx.tenant.id, ctx.tenant.environment, role);
  const token = await issueVerificationToken(userId, 'INVITE');
  await sendInviteEmail(normalizedEmail, ctx.tenant.businessName, token);

  revalidatePath('/users');
  return null;
}

export async function resendInviteAction(userId: string): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };
  if (user.inviteStatus !== 'INVITED') return { error: 'USER_ALREADY_IN_TENANT' };

  // issueVerificationToken supersedes any prior unconsumed invite token for
  // this user, so the original invite link stops working the moment this
  // one is sent.
  const token = await issueVerificationToken(user.id, 'INVITE');
  await sendInviteEmail(user.email, ctx.tenant.businessName, token);
  return null;
}

export async function updateUserRoleAction(userId: string, role: Role): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  if (userId === ctx.user.id) return { error: 'CANNOT_CHANGE_OWN_ROLE' };

  const grantError = assertCanGrantRole(role, ctx.user.role);
  if (grantError) return grantError;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };

  await db.user.update({ where: { id: userId }, data: { role } });
  await ensureRoleApiKeyBestEffort(ctx.tenant.id, ctx.tenant.environment, role);
  revalidatePath('/users');
  return null;
}

export async function removeUserAction(userId: string): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  if (userId === ctx.user.id) return { error: 'CANNOT_REMOVE_SELF' };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };

  await db.user.update({
    where: { id: userId },
    data: { tenantId: null, role: null, inviteStatus: 'ACTIVE' },
  });
  await db.userIssuerAccess.deleteMany({ where: { userId } });
  revalidatePath('/users');
  return null;
}

export async function setUserIssuerAccessAction(
  userId: string,
  issuerIds: string[],
): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };

  // Verify all issuer IDs belong to this tenant
  const issuers = await db.issuer.findMany({
    where: { id: { in: issuerIds }, tenantId: ctx.tenant.id, active: true },
  });
  if (issuers.length !== issuerIds.length) return { error: 'ISSUER_NOT_FOUND' };

  await db.$transaction(async (tx) => {
    await tx.userIssuerAccess.deleteMany({ where: { userId } });
    if (issuerIds.length > 0) {
      await tx.userIssuerAccess.createMany({
        data: issuerIds.map((issuerId) => ({
          userId,
          tenantId: ctx.tenant.id,
          issuerId,
        })),
      });
    }
  });

  revalidatePath('/users');
  return null;
}

async function sendPasswordResetEmail(email: string, businessName: string, token: string) {
  try {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'email.passwordReset' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not configured');
    const link = `${appUrl}/${locale}/complete-registration?token=${token}`;
    const subject = t('subject');
    const text = `${t('greeting', { businessName })}\n\n${t('cta')}\n\n${link}`;
    const html = `<p>${t('greeting', { businessName })}</p><p>${t('cta')}</p><p><a href="${link}">${link}</a></p>`;
    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    Sentry.captureException(err, { extra: { email } });
  }
}

export async function updateUserAction(
  userId: string,
  data: { firstName?: string | null; lastName?: string | null; role?: Role; issuerIds?: string[] },
): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };

  const userUpdate: { firstName?: string | null; lastName?: string | null; role?: string } = {
    firstName: data.firstName ?? undefined,
    lastName: data.lastName ?? undefined,
  };

  if (data.role !== undefined && userId !== ctx.user.id) {
    const grantError = assertCanGrantRole(data.role, ctx.user.role);
    if (grantError) return grantError;
    userUpdate.role = data.role;
  }

  await db.user.update({ where: { id: userId }, data: userUpdate });

  if (userUpdate.role !== undefined) {
    await ensureRoleApiKeyBestEffort(ctx.tenant.id, ctx.tenant.environment, userUpdate.role as Role);
  }

  if (data.issuerIds !== undefined) {
    if (data.issuerIds.length > 0) {
      const issuers = await db.issuer.findMany({
        where: { id: { in: data.issuerIds }, tenantId: ctx.tenant.id, active: true },
      });
      if (issuers.length !== data.issuerIds.length) return { error: 'ISSUER_NOT_FOUND' };
    }
    await db.$transaction(async (tx) => {
      await tx.userIssuerAccess.deleteMany({ where: { userId } });
      if (data.issuerIds!.length > 0) {
        await tx.userIssuerAccess.createMany({
          data: data.issuerIds!.map((issuerId) => ({
            userId,
            tenantId: ctx.tenant.id,
            issuerId,
          })),
        });
      }
    });
  }

  revalidatePath('/users');
  return null;
}

export async function toggleUserActiveAction(
  userId: string,
  active: boolean,
): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  if (userId === ctx.user.id) return { error: 'CANNOT_DISABLE_SELF' };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };

  await db.user.update({ where: { id: userId }, data: { active } });
  revalidatePath('/users');
  return null;
}

export async function resetUserPasswordAction(userId: string): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  if (userId === ctx.user.id) return { error: 'CANNOT_RESET_OWN_PASSWORD' };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };
  if (user.inviteStatus !== 'ACTIVE') return { error: 'USER_ALREADY_IN_TENANT' };

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: null, inviteStatus: 'INVITED' },
  });

  // This flow routes through /complete-registration (same as a first-time
  // invite, not /reset-password), so it needs an 'INVITE'-purpose token.
  const token = await issueVerificationToken(userId, 'INVITE');
  await sendPasswordResetEmail(user.email, ctx.tenant.businessName, token);
  return null;
}
