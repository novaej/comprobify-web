'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { createTenantApiKey, revokeTenantApiKey } from '@/lib/api';
import { encrypt, lastFour } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type ApiKeyResult = { error: string } | null;
export type CreateApiKeyResult = { error: string } | { key: string; label: string } | null;

export async function createTenantApiKeyAction(label: string): Promise<CreateApiKeyResult> {
  await requirePermission('apikeys.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  let created;
  try {
    created = await createTenantApiKey({ apiKey: ctx.apiKey }, label.trim() || 'default');
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.tenantApiKey.create({
    data: {
      tenantId: ctx.tenant.id,
      apiKeyId: created.id,
      label: created.label,
      environment: ctx.tenant.environment,
      encryptedKey: encrypt(created.key),
      lastFour: lastFour(created.key),
      isActive: true,
    },
  });

  revalidatePath('/api-keys');
  return { key: created.key, label: created.label };
}

export async function revokeTenantApiKeyAction(id: number): Promise<ApiKeyResult> {
  await requirePermission('apikeys.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const keyRow = await db.tenantApiKey.findUnique({ where: { id } });
  if (!keyRow || keyRow.tenantId !== ctx.tenant.id) return { error: 'NOT_FOUND' };
  if (!keyRow.isActive) return { error: 'ALREADY_REVOKED' };

  try {
    await revokeTenantApiKey({ apiKey: ctx.apiKey }, keyRow.apiKeyId);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.tenantApiKey.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
  });

  revalidatePath('/api-keys');
  return null;
}
