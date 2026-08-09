'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { createTenantApiKey, revokeTenantApiKey, getTenantApiKeyUsage, type ApiKeyDailyUsage } from '@/lib/api';
import { encrypt, lastFour } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import type { ApiKeyScope } from '@/lib/role-api-scopes';

export type ApiKeyResult = { error: string } | null;
export type CreateApiKeyResult = { error: string } | { key: string; label: string } | null;
export type ApiKeyUsageResult = { error: string } | { usage: ApiKeyDailyUsage[] };

export async function createTenantApiKeyAction(label: string, scopes?: ApiKeyScope[]): Promise<CreateApiKeyResult> {
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
      scopes,
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
      scopes: created.scopes,
    },
  });

  revalidatePath('/settings/api-keys');
  return { key: created.key, label: created.label };
}

export async function revokeTenantApiKeyAction(id: string): Promise<ApiKeyResult> {
  await requirePermission('apikeys.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const keyRow = await db.tenantApiKey.findUnique({ where: { id } });
  if (!keyRow || keyRow.tenantId !== ctx.tenant.id) return { error: 'NOT_FOUND' };
  if (!keyRow.isActive) return { error: 'ALREADY_REVOKED' };

  // App-managed keys (master or per-role) can't be revoked — the API itself
  // refuses SELF_REVOCATION_FORBIDDEN, and it'd cut that role off from the API.
  if (keyRow.isManaged) return { error: 'SELF_REVOCATION_FORBIDDEN' };

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

  revalidatePath('/settings/api-keys');
  return null;
}

export async function getTenantApiKeyUsageAction(id: string, days?: number): Promise<ApiKeyUsageResult> {
  await requirePermission('apikeys.read', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const keyRow = await db.tenantApiKey.findUnique({ where: { id } });
  if (!keyRow || keyRow.tenantId !== ctx.tenant.id) return { error: 'NOT_FOUND' };

  try {
    const usage = await getTenantApiKeyUsage({ apiKey: ctx.apiKey }, keyRow.apiKeyId, days);
    return { usage };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}
