'use server';

import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { recoverAccount } from '@/lib/public-api';
import { listTenantApiKeys } from '@/lib/api';
import { extractForwardedIp } from '@/lib/client-forwarding';
import { encrypt, lastFour } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';
import * as Sentry from '@sentry/nextjs';

export type RecoverAccountActionResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true; linked: true }
  | { ok: true; matched: true; linked: false; apiKey: string; environment: string }
  | { error: string };

/**
 * Public, unauthenticated recovery flow for POST /v1/recover — no session is
 * required or checked here, since a matching certificate is the same proof
 * of ownership the API itself already requires before it ever returns a key.
 */
export async function recoverAccountAction(formData: FormData): Promise<RecoverAccountActionResult> {
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const certPassword = (formData.get('certPassword') as string | null) ?? '';
  const certFile = formData.get('cert') as File | null;

  if (!email) return { error: 'EMAIL_REQUIRED' };
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

  let result;
  try {
    const reqHeaders = await headers();
    result = await recoverAccount(email, p12Buffer, certPassword, {
      forwardedIp: extractForwardedIp(reqHeaders),
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  if (!result.matched) {
    return { ok: true, matched: false };
  }

  const apiTenantId = result.tenant.id;
  const localTenant = await db.tenant.findUnique({ where: { apiTenantId } });

  if (!localTenant) {
    // This tenant was never linked to this app (or a previous link attempt never
    // finished) — hand the recovered key back so the user can complete the
    // existing "link existing account" flow themselves. We deliberately don't
    // create a bare Tenant row here: linkExistingTenantAction's uniqueness check
    // on apiTenantId would then see it as already linked and block the real step.
    return {
      ok: true,
      matched: true,
      linked: false,
      apiKey: result.apiKey,
      environment: result.environment,
    };
  }

  // Already linked locally — the API just revoked whichever key(s) it had for
  // this environment and minted this one, so the app's own stored copy is now
  // stale. POST /v1/recover only returns the plaintext token, not its API-side
  // id (same limitation as POST /v1/keys — see CLAUDE.md Common Mistake #18),
  // so resolve it with a follow-up GET before persisting.
  const keys = await listTenantApiKeys({ apiKey: result.apiKey }).catch(() => []);
  const keyRecord = keys[0];
  if (!keyRecord) {
    console.error('[recovery] recovered key did not resolve via listTenantApiKeys', { apiTenantId });
    Sentry.captureException(new Error('Recovered key missing from listTenantApiKeys'), {
      extra: { apiTenantId },
    });
    return { error: 'DB_WRITE_FAILED' };
  }

  try {
    await db.$transaction([
      db.tenantApiKey.updateMany({
        where: { tenantId: localTenant.id, environment: result.environment, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      }),
      db.tenantApiKey.create({
        data: {
          tenantId: localTenant.id,
          apiKeyId: keyRecord.id,
          label: keyRecord.label ?? 'Recovery key',
          environment: result.environment,
          encryptedKey: encrypt(result.apiKey),
          lastFour: lastFour(result.apiKey),
          isActive: true,
        },
      }),
    ]);
  } catch (err) {
    console.error('[recovery] failed to persist recovered key', err);
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  return { ok: true, matched: true, linked: true };
}
