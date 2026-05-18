'use server';

import { db } from '@/lib/db';
import { requireContext } from '@/lib/context';
import { writeCtxCookie, clearCtxCookie } from '@/lib/context-cookie';
import { revalidatePath } from 'next/cache';

export type ContextResult = { error: string } | null;

export async function selectIssuerAction(issuerId: number): Promise<ContextResult> {
  const ctx = await requireContext({ skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) {
    return { error: 'ISSUER_NOT_FOUND' };
  }

  await writeCtxCookie({ issuerId, v: 1 });
  revalidatePath('/', 'layout');
  return null;
}

export async function clearContextAction(): Promise<void> {
  await clearCtxCookie();
  revalidatePath('/', 'layout');
}
