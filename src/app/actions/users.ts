'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { revalidatePath } from 'next/cache';
import type { Role } from '@/lib/rbac';

export type UsersResult = { error: string } | null;

export async function inviteUserAction(email: string, role: Role): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const existing = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
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
        email: email.trim().toLowerCase(),
        tenantId: ctx.tenant.id,
        role,
        inviteStatus: 'INVITED',
        invitedAt: new Date(),
      },
    });
  }

  revalidatePath('/users');
  return null;
}

export async function updateUserRoleAction(userId: number, role: Role): Promise<UsersResult> {
  await requirePermission('users.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  if (userId === ctx.user.id) return { error: 'CANNOT_CHANGE_OWN_ROLE' };

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
    where: { id: { in: issuerIds }, tenantId: ctx.tenant.id },
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
