'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { createTenantApiKey, revokeTenantApiKey } from '@/lib/api';
import { encrypt, lastFour } from '@/lib/crypto';
import { findAppApiKeyRow } from '@/lib/tenant-api-key';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type ApiKeyResult = { error: string } | null;
export type CreateApiKeyResult = { error: string } | { key: string; label: string } | null;

export async function createTenantApiKeyAction(label: string): Promise<CreateApiKeyResult> {
  await requirePermission('apikeys.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  let created;
  try {
    // The environment MUST be sent explicitly: POST /v1/keys defaults to 'sandbox'
    // (api-key.service.js → createKey), and the API then rejects that key on a
    // promoted tenant with API_KEY_ENV_MISMATCH — so a production tenant would
    // otherwise mint keys that authenticate for nothing.
    created = await createTenantApiKey(
      { apiKey: ctx.apiKey },
      label.trim() || 'default',
      ctx.tenant.environment,
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.tenantApiKey.create({
    data: {
      tenantId: ctx.tenant.id,
      apiKeyId: created.id,
      label: created.label,
      // Mirror what the API actually stored, not what we asked for.
      environment: created.environment,
      encryptedKey: encrypt(created.key),
      lastFour: lastFour(created.key),
      isActive: true,
    },
  });

  revalidatePath('/api-keys');
  return { key: created.key, label: created.label };
}

export async function revokeTenantApiKeyAction(id: string): Promise<ApiKeyResult> {
  await requirePermission('apikeys.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const keyRow = await db.tenantApiKey.findUnique({ where: { id } });
  if (!keyRow || keyRow.tenantId !== ctx.tenant.id) return { error: 'NOT_FOUND' };
  if (!keyRow.isActive) return { error: 'ALREADY_REVOKED' };

  // The key this app authenticates with can't be revoked: the API refuses to
  // revoke the key that signed the revoke request (SELF_REVOCATION_FORBIDDEN),
  // and revoking it would leave the whole web app unable to reach the API.
  // The UI already disables that row's button — this is the action-side gate.
  const appKey = await findAppApiKeyRow(ctx.tenant.id, ctx.tenant.environment);
  if (appKey?.id === keyRow.id) return { error: 'SELF_REVOCATION_FORBIDDEN' };

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
