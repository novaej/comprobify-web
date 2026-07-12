'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { sendMail } from '@/lib/mailgun';
import * as Sentry from '@sentry/nextjs';
import type { Role } from '@/lib/rbac';

export type UsersResult = { error: string } | null;

function assertCanGrantRole(role: Role, callerRole: Role): UsersResult {
  if (role === 'Owner' && callerRole !== 'Owner') {
    return { error: 'ONLY_OWNER_CAN_GRANT_OWNER' };
  }
  return null;
}

/** Best-effort invite email — a delivery failure must not block the invite itself. */
async function sendInviteEmail(email: string, businessName: string) {
  try {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'email.invite' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not configured');

    const link = `${appUrl}/${locale}/complete-registration?email=${encodeURIComponent(email)}`;
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
  if (existing) {
    if (existing.tenantId && existing.tenantId !== ctx.tenant.id) {
      return { error: 'USER_BELONGS_TO_ANOTHER_TENANT' };
    }
    if (existing.tenantId === ctx.tenant.id) return { error: 'USER_ALREADY_IN_TENANT' };
    // Existing user with no tenant — link them
    await db.user.update({
      where: { id: existing.id },
      data: { tenantId: ctx.tenant.id, role, inviteStatus: 'INVITED', invitedAt: new Date() },
    });
  } else {
    await db.user.create({
      data: {
        email: normalizedEmail,
        tenantId: ctx.tenant.id,
        role,
        inviteStatus: 'INVITED',
        invitedAt: new Date(),
      },
    });
  }

  await sendInviteEmail(normalizedEmail, ctx.tenant.businessName);

  revalidatePath('/users');
  return null;
}

export async function resendInviteAction(userId: number): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };
  if (user.inviteStatus !== 'INVITED') return { error: 'USER_ALREADY_IN_TENANT' };

  await sendInviteEmail(user.email, ctx.tenant.businessName);
  return null;
}

export async function updateUserRoleAction(userId: number, role: Role): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  if (userId === ctx.user.id) return { error: 'CANNOT_CHANGE_OWN_ROLE' };

  const grantError = assertCanGrantRole(role, ctx.user.role);
  if (grantError) return grantError;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.tenantId !== ctx.tenant.id) return { error: 'USER_NOT_FOUND' };

  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath('/users');
  return null;
}

export async function removeUserAction(userId: number): Promise<UsersResult> {
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
  userId: number,
  issuerIds: number[],
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

async function sendPasswordResetEmail(email: string, businessName: string) {
  try {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'email.passwordReset' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not configured');
    const link = `${appUrl}/${locale}/complete-registration?email=${encodeURIComponent(email)}`;
    const subject = t('subject');
    const text = `${t('greeting', { businessName })}\n\n${t('cta')}\n\n${link}`;
    const html = `<p>${t('greeting', { businessName })}</p><p>${t('cta')}</p><p><a href="${link}">${link}</a></p>`;
    await sendMail({ to: email, subject, text, html });
  } catch (err) {
    Sentry.captureException(err, { extra: { email } });
  }
}

export async function updateUserAction(
  userId: number,
  data: { firstName?: string | null; lastName?: string | null; role?: Role; issuerIds?: number[] },
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
  userId: number,
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

export async function resetUserPasswordAction(userId: number): Promise<UsersResult> {
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

  await sendPasswordResetEmail(user.email, ctx.tenant.businessName);
  return null;
}
