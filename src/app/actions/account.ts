'use server';

import { db } from '@/lib/db';
import { requireContext } from '@/lib/context';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import * as Sentry from '@sentry/nextjs';

export type AccountResult = { error: string } | null;

export async function updateProfileAction(data: {
  firstName: string | null;
  lastName: string | null;
}): Promise<AccountResult> {
  try {
    const ctx = await requireContext({ skipIssuer: true });
    await db.user.update({
      where: { id: ctx.user.id },
      data: {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
      },
    });
    revalidatePath('/settings/account');
    revalidatePath('/settings');
    return null;
  } catch (err) {
    Sentry.captureException(err);
    return { error: 'UNEXPECTED_ERROR' };
  }
}

export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<AccountResult> {
  try {
    const ctx = await requireContext({ skipIssuer: true });
    const user = await db.user.findUnique({
      where: { id: ctx.user.id },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) return { error: 'NO_PASSWORD_SET' };

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) return { error: 'WRONG_CURRENT_PASSWORD' };

    if (data.newPassword.length < 8) return { error: 'PASSWORD_TOO_SHORT' };

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await db.user.update({ where: { id: ctx.user.id }, data: { passwordHash } });
    return null;
  } catch (err) {
    Sentry.captureException(err);
    return { error: 'UNEXPECTED_ERROR' };
  }
}
