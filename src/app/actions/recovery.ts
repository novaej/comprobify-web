'use server';

import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { recoverAccount, type RecoverAccountResult } from '@/lib/public-api';
import { listTenantIssuers } from '@/lib/api';
import { listAdminApiKeys } from '@/lib/admin-api';
import { extractForwardedIp } from '@/lib/client-forwarding';
import { encrypt, lastFour } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';
import * as Sentry from '@sentry/nextjs';

export type RecoverAccountActionResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true; outcome: 'alreadyLinked' }
  | { ok: true; matched: true; outcome: 'resynced' }
  | { ok: true; matched: true; outcome: 'justLinked' }
  | { error: string };

type MatchedRecoverAccountResult = Extract<RecoverAccountResult, { matched: true; alreadyLinked: false }>;

type LocalUser = { id: string; tenantId: string | null };

/**
 * Public, unauthenticated entry point for POST /v1/recover. Despite the
 * name, this isn't really "recover a lost API key" anymore — every key
 * comprobify-web mints is `is_reserved` (comprobify migration 102) and
 * never shown to a human, so there's no plaintext key to lose in the first
 * place. The one thing that can still be broken and that nothing else can
 * fix is the *local link* between a comprobify-web login and its Comprobify
 * tenant — never linked to begin with, or lost/corrupted on this side.
 *
 * Entirely session-independent, on purpose — comprobify-web is the *only*
 * path that can ever create a tenant at the API (POST /v1/register is
 * gated behind X-Internal-Service-Secret, see CLAUDE.md's ADR-035 notes),
 * and bootstrapTenantAction always creates the local User+Tenant link in
 * the same transaction as registering. So a tenant with no local Tenant row
 * still has a corresponding local User row *somewhere* (its own local data
 * just fell out of sync — e.g. a DB restore gap) — there's no scenario
 * where a real match needs a brand-new login created on the spot. The one
 * local User lookup below (by the email typed into this form, not the
 * currently-browsing session) resolves both what to tell the API
 * (`alreadyLinked`) and, for a genuinely-unlinked match, which existing
 * login to attach the tenant to.
 */
export async function recoverAccountAction(formData: FormData): Promise<RecoverAccountActionResult> {
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const certPassword = (formData.get('certPassword') as string | null) ?? '';
  const certFile = formData.get('cert') as File | null;

  if (!email) return { error: 'EMAIL_REQUIRED' };
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

  const existingUser: LocalUser | null = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, tenantId: true },
  });

  let result: RecoverAccountResult;
  try {
    const reqHeaders = await headers();
    result = await recoverAccount(email, p12Buffer, certPassword, Boolean(existingUser?.tenantId), {
      forwardedIp: extractForwardedIp(reqHeaders),
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  if (!result.matched) {
    return { ok: true, matched: false };
  }

  if (result.alreadyLinked) {
    return { ok: true, matched: true, outcome: 'alreadyLinked' };
  }

  const apiTenantId = result.tenant.id;
  const localTenant = await db.tenant.findUnique({ where: { apiTenantId } });

  if (!localTenant) {
    // The link is missing entirely — never linked to this app, or a
    // previous attempt never finished. Attach the local Tenant/Issuer/
    // TenantApiKey set to the existing login found above (by the submitted
    // email, not a session) — see the module doc comment for why there's
    // always one to find.
    return autoLinkRecoveredTenant(result, apiTenantId, existingUser);
  }

  // The link already exists, but our local `alreadyLinked` hint above missed
  // it (e.g. the tenant is linked under a different login email than the
  // one typed here) — so the API ran its full match+rotate path after all.
  // It revoked whichever key(s) it had for this environment and minted this
  // one (reserved, see recoverAccount()), so the app's own stored copy is
  // now genuinely stale and needs resyncing. POST /v1/recover only returns
  // the plaintext token, not its API-side id (CLAUDE.md Common Mistake #18) —
  // and since the key is reserved, it's invisible to the tenant-facing GET
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

  return { ok: true, matched: true, outcome: 'resynced' };
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
 * matched by recovery but never linked to this app, and attaches them to
 * `existingUser` — the local login found by the *submitted* email, not any
 * currently-browsing session (see the module doc comment for why one
 * should always exist). Deliberately does not sign anyone in: a matching
 * certificate proves ownership of the tenant, not knowledge of
 * `existingUser`'s own comprobify-web password, so those two proofs stay
 * separate — the user logs in normally afterward with their own
 * credentials, same as the "already linked" branch already requires.
 */
async function autoLinkRecoveredTenant(
  result: MatchedRecoverAccountResult,
  apiTenantId: string,
  existingUser: LocalUser | null,
): Promise<RecoverAccountActionResult> {
  if (!existingUser) {
    // Should not be reachable in practice — comprobify-web is the only path
    // that can ever create a tenant, and always creates its local User in
    // the same transaction (see module doc comment) — so this signals a
    // genuine local data anomaly (e.g. a restored-from-backup gap) worth
    // investigating, not a normal user-facing outcome.
    console.error('[recovery] no local User found for submitted email during auto-link', { apiTenantId });
    Sentry.captureException(new Error('Recovery auto-link found no matching local User'), {
      extra: { apiTenantId },
    });
    return { error: 'RECOVERY_ACCOUNT_NOT_FOUND' };
  }
  if (existingUser.tenantId) return { error: 'TENANT_ALREADY_EXISTS' };

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

  try {
    await db.$transaction(async (tx) => {
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

      for (const apiIssuer of apiIssuers) {
        await tx.issuer.create({
          data: {
            tenantId: tenant.id,
            apiIssuerId: apiIssuer.id,
            branchCode: apiIssuer.branchCode,
            issuePointCode: apiIssuer.issuePointCode,
            businessName: apiIssuer.businessName,
            tradeName: apiIssuer.tradeName,
            branchAddress: apiIssuer.branchAddress,
            isDefault: apiIssuer.id === defaultIssuer.id,
          },
        });
      }

      await tx.user.update({
        where: { id: existingUser.id },
        data: { tenantId: tenant.id, role: 'Owner' },
      });
    });
  } catch (err) {
    // Sentry is a no-op locally (no DSN), so log too — otherwise this failure is
    // invisible in dev and the user only sees the generic DB_WRITE_FAILED copy.
    console.error('[recovery] auto-link transaction failed', err);
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  return { ok: true, matched: true, outcome: 'justLinked' };
}
