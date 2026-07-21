'use server';

import { db } from '@/lib/db';
import { requireContext } from '@/lib/context';
import { writeCtxCookie, clearCtxCookie } from '@/lib/context-cookie';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

export type ContextResult = { error: string } | null;

export async function selectIssuerAction(issuerId: string): Promise<ContextResult> {
  const ctx = await requireContext({ skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id || !issuer.active) {
    return { error: 'ISSUER_NOT_FOUND' };
  }

  await writeCtxCookie({ issuerId, v: 2 });
  revalidatePath('/', 'layout');
  return null;
}

/** Used by /issuer/select: sets the cookie and immediately redirects to /dashboard. */
export async function selectIssuerAndRedirectAction(issuerId: string): Promise<void> {
  const ctx = await requireContext({ skipIssuer: true });
  const locale = await getLocale();

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id || !issuer.active) {
    redirect({ href: '/issuer/select', locale });
  }

  await writeCtxCookie({ issuerId, v: 2 });
  revalidatePath('/', 'layout');
  redirect({ href: '/dashboard', locale });
}

export async function clearContextAction(): Promise<void> {
  await clearCtxCookie();
  revalidatePath('/', 'layout');
}
