'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { recoverAccount, type RecoverAccountResult } from '@/lib/public-api';
import { listTenantIssuers } from '@/lib/api';
import { listAdminApiKeys } from '@/lib/admin-api';
import { extractForwardedIp } from '@/lib/client-forwarding';
import { encrypt, lastFour } from '@/lib/crypto';
import { writeCtxCookie } from '@/lib/context-cookie';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { isUuid } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';

export type RecoverAccountActionResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true }
  | { error: string };

type MatchedRecoverAccountResult = Extract<RecoverAccountResult, { matched: true }>;

/**
 * Public, unauthenticated entry point for POST /v1/recover — no session is
 * required or checked here for the initial cert-match step, since a matching
 * certificate is the same proof of ownership the API itself already requires
 * before it ever returns a key. A session is only required past that point,
 * for the "never linked to this app yet" branch below, which creates a new
 * local Tenant/Issuer/TenantApiKey set and needs a user to attach it to.
 */
export async function recoverAccountAction(formData: FormData): Promise<RecoverAccountActionResult> {
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const certPassword = (formData.get('certPassword') as string | null) ?? '';
  const certFile = formData.get('cert') as File | null;

  if (!email) return { error: 'EMAIL_REQUIRED' };
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

  let result: RecoverAccountResult;
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
    // Never linked to this app (or a previous attempt never finished) —
    // automatically create the local Tenant/Issuer/TenantApiKey set and
    // attach it to the signed-in user, the same way onboarding's "link
    // existing account" tab used to (before it was replaced by this flow).
    return autoLinkRecoveredTenant(result, apiTenantId);
  }

  // Already linked locally — the API just revoked whichever key(s) it had for
  // this environment and minted this one (reserved, see recoverAccount()), so
  // the app's own stored copy is now stale. POST /v1/recover only returns the
  // plaintext token, not its API-side id (CLAUDE.md Common Mistake #18) — and
  // since the key is reserved, it's invisible to the tenant-facing GET
  // /v1/keys (comprobify migration 102), so resolve it via the admin listing
  // instead. recover() just did a revoke-all-then-create-one for this
  // environment, so the newest active admin-listed row is exactly this one.
  const keyRecord = await resolveRecoveredKeyRecord(apiTenantId, result.environment);
  if (!keyRecord) return { error: 'DB_WRITE_FAILED' };

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
          isManaged: true, // updateMany above revoked every other key, so this becomes the new master key
          scopes: keyRecord.scopes,
        },
      }),
    ]);
  } catch (err) {
    console.error('[recovery] failed to persist recovered key', err);
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  return { ok: true, matched: true };
}

/**
 * Resolves the just-minted "Recovery key" row's metadata (id/scopes) — see
 * Common Mistake #18. Filtered by label+environment rather than trusting
 * "newest in the list", since a concurrent per-role mint (resolveApiKeyForRole)
 * could otherwise race ahead of it in the admin listing.
 */
async function resolveRecoveredKeyRecord(apiTenantId: string, environment: 'sandbox' | 'production') {
  const adminKeys = await listAdminApiKeys(apiTenantId).catch(() => []);
  const keyRecord = adminKeys.find((k) => k.label === 'Recovery key' && k.environment === environment);
  if (!keyRecord) {
    console.error('[recovery] recovered key did not resolve via listAdminApiKeys', { apiTenantId });
    Sentry.captureException(new Error('Recovered key missing from listAdminApiKeys'), {
      extra: { apiTenantId },
    });
  }
  return keyRecord ?? null;
}

/**
 * Creates the local Tenant/Issuer(s)/TenantApiKey rows for an API tenant
 * matched by recovery but never linked to this app, and attaches the
 * signed-in user as Owner — the automatic replacement for the old
 * "link existing account" onboarding tab (see CLAUDE.md's recovery notes).
 * Requires a session: someone with no comprobify-web login yet needs to sign
 * up first, then retry recovery.
 */
async function autoLinkRecoveredTenant(
  result: MatchedRecoverAccountResult,
  apiTenantId: string,
): Promise<RecoverAccountActionResult> {
  const session = await auth();
  if (!session?.user?.id || !isUuid(session.user.id)) {
    return { error: 'RECOVERY_LOGIN_REQUIRED' };
  }

  const userId = session.user.id;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'RECOVERY_LOGIN_REQUIRED' };
  if (user.tenantId) return { error: 'TENANT_ALREADY_EXISTS' };

  let apiIssuers: Awaited<ReturnType<typeof listTenantIssuers>>;
  try {
    apiIssuers = await listTenantIssuers({ apiKey: result.apiKey });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  if (apiIssuers.length === 0) return { error: 'NO_ISSUERS_FOUND' };

  const keyRecord = await resolveRecoveredKeyRecord(apiTenantId, result.environment);
  if (!keyRecord) return { error: 'DB_WRITE_FAILED' };

  const defaultIssuer = apiIssuers[0];

  let defaultLocalIssuerId: string;
  try {
    defaultLocalIssuerId = await db.$transaction(async (tx): Promise<string> => {
      const tenant = await tx.tenant.create({
        data: {
          apiTenantId,
          ruc: defaultIssuer.ruc,
          businessName: defaultIssuer.businessName,
          tradeName: defaultIssuer.tradeName,
          environment: result.environment,
          status: 'ACTIVE', // recover() already required the tenant's email to be verified
        },
      });

      await tx.tenantApiKey.create({
        data: {
          tenantId: tenant.id,
          apiKeyId: keyRecord.id,
          label: keyRecord.label ?? 'Recovery key',
          environment: result.environment,
          encryptedKey: encrypt(result.apiKey),
          lastFour: lastFour(result.apiKey),
          isActive: true,
          isManaged: true, // the recovered key is full-access (ALL_SCOPES) — the tenant's master key
          scopes: keyRecord.scopes,
        },
      });

      let firstLocalIssuerId: string | null = null;
      for (const apiIssuer of apiIssuers) {
        const issuer: { id: string } = await tx.issuer.create({
          data: {
            tenantId: tenant.id,
            apiIssuerId: apiIssuer.id,
            branchCode: apiIssuer.branchCode,
            issuePointCode: apiIssuer.issuePointCode,
            businessName: apiIssuer.businessName,
            tradeName: apiIssuer.tradeName,
            branchAddress: apiIssuer.branchAddress,
            isDefault: firstLocalIssuerId === null,
          },
        });
        if (firstLocalIssuerId === null) firstLocalIssuerId = issuer.id;
      }

      await tx.user.update({
        where: { id: userId },
        data: { tenantId: tenant.id, role: 'Owner' },
      });

      return firstLocalIssuerId as string;
    });
  } catch (err) {
    // Sentry is a no-op locally (no DSN), so log too — otherwise this failure is
    // invisible in dev and the user only sees the generic DB_WRITE_FAILED copy.
    console.error('[recovery] auto-link transaction failed', err);
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  await writeCtxCookie({ issuerId: defaultLocalIssuerId, v: 2 });

  revalidatePath('/', 'layout');
  const locale = await getLocale();
  // Redirect to /agreements so the tenant can review and accept legal documents,
  // same as the old linkExistingTenantAction — safe even for a tenant that was
  // never through POST /v1/register, since getStatus() lazily generates
  // per-tenant documents for any published template version.
  redirect({ href: '/agreements', locale });
  return null as never;
}
