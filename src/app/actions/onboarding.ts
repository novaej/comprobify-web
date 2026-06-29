'use server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { registerTenant } from '@/lib/public-api';
import { listTenantApiKeys, getCurrentTenant, listTenantIssuers, createTenantApiKey } from '@/lib/api';
import { encrypt, lastFour } from '@/lib/crypto';
import { writeCtxCookie } from '@/lib/context-cookie';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { parseIntendedPlan } from '@/lib/subscription-tiers';
import * as Sentry from '@sentry/nextjs';

export type OnboardingResult = { error: string } | null;

export async function bootstrapTenantAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'UNAUTHORIZED' };

  const userId = Number(session.user.id);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'UNAUTHORIZED' };
  if (user.tenantId) return { error: 'TENANT_ALREADY_EXISTS' };

  const ruc = (formData.get('ruc') as string | null)?.trim() ?? '';
  const businessName = (formData.get('businessName') as string | null)?.trim() ?? '';
  const tradeName = (formData.get('tradeName') as string | null)?.trim() || undefined;
  const mainAddress = (formData.get('mainAddress') as string | null)?.trim() || undefined;
  const branchCode = ((formData.get('branchCode') as string | null)?.trim() || '001').slice(0, 3);
  const issuePointCode = ((formData.get('issuePointCode') as string | null)?.trim() || '001').slice(0, 3);
  const requiredAccounting = formData.get('requiredAccounting') === 'on';
  const certPassword = (formData.get('certPassword') as string | null) ?? '';
  const intendedPlan = parseIntendedPlan(
    formData.get('intendedTier') as string | null,
    formData.get('intendedBillingInterval') as string | null,
  );

  if (!ruc || !businessName) return { error: 'REQUIRED_FIELDS' };

  const certFile = formData.get('cert') as File | null;
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

  const logoFile = formData.get('logo') as File | null;
  const logoBuffer = logoFile && logoFile.size > 0 ? Buffer.from(await logoFile.arrayBuffer()) : undefined;

  const initialSequentials: { documentType: string; sequential: number }[] = [];
  for (const code of ['01', '04', '05', '06', '07']) {
    const seqStr = formData.get(`seq_${code}`) as string | null;
    if (seqStr) {
      initialSequentials.push({ documentType: code, sequential: Math.max(1, parseInt(seqStr) || 1) });
    }
  }

  const locale = await getLocale();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const verificationRedirectUrl = appUrl ? `${appUrl}/${locale}/verify-email` : undefined;

  let apiTenantId: number;
  let apiIssuerId: number;
  let plainApiKey: string;
  let isEmailVerified: boolean;

  try {
    const result = await registerTenant(
      user.email,
      {
        ruc,
        businessName,
        tradeName,
        mainAddress,
        branchCode,
        issuePointCode,
        emissionType: '1',
        requiredAccounting,
        documentTypes: ['01'],
        initialSequentials,
        language: locale,
      },
      p12Buffer,
      certPassword,
      verificationRedirectUrl,
      logoBuffer,
      logoFile?.type,
    );
    apiTenantId = result.tenantId;
    apiIssuerId = result.issuerId;
    plainApiKey = result.apiKey;
    isEmailVerified = result.isEmailVerified;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // Fetch key metadata to get the API-side key ID
  const keys = await listTenantApiKeys({ apiKey: plainApiKey }).catch(() => []);
  const keyRecord = keys[0];
  if (!keyRecord) return { error: 'DB_WRITE_FAILED' };

  let newIssuerId: number;
  try {
    newIssuerId = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          apiTenantId,
          ruc,
          businessName,
          tradeName,
          environment: 'sandbox',
          status: isEmailVerified ? 'ACTIVE' : 'PENDING',
          intendedTier: intendedPlan?.tier,
          intendedBillingInterval: intendedPlan?.interval,
        },
      });

      await tx.tenantApiKey.create({
        data: {
          tenantId: tenant.id,
          apiKeyId: Number(keyRecord.id),
          label: keyRecord.label ?? 'Initial sandbox key',
          environment: 'sandbox',
          encryptedKey: encrypt(plainApiKey),
          lastFour: lastFour(plainApiKey),
          isActive: true,
        },
      });

      const issuer = await tx.issuer.create({
        data: {
          tenantId: tenant.id,
          apiIssuerId,
          branchCode,
          issuePointCode,
          businessName,
          tradeName,
          branchAddress: mainAddress,
          isDefault: true,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { tenantId: tenant.id, role: 'Owner' },
      });

      return issuer.id;
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  // Write the context cookie after the transaction commits — cookie writes are
  // not transactional and must not be inside $transaction or a failure would
  // silently roll back all the DB writes above.
  await writeCtxCookie({ issuerId: newIssuerId, v: 1 });

  revalidatePath('/', 'layout');
  redirect({ href: isEmailVerified ? '/dashboard' : '/settings', locale });
  return null;
}

/**
 * Links an existing Comprobify API account (registered directly via the API,
 * not through this app) to the current web session.
 *
 * The pasted API key is used once, in-memory, to:
 *   1. Resolve tenant identity (GET /v1/tenants/me) and issuer list (GET /v1/issuers).
 *   2. Mint a fresh, dedicated key for the web app (POST /v1/keys) — the pasted
 *      key itself is never stored, so it keeps working independently elsewhere.
 *
 * `Tenant.apiTenantId` is unique in the schema, so a given API tenant can only
 * be linked once. The first user to link becomes Owner; everyone else joins via
 * the existing invite flow (`/users`).
 */
export async function linkExistingTenantAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'UNAUTHORIZED' };

  const userId = Number(session.user.id);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'UNAUTHORIZED' };
  if (user.tenantId) return { error: 'TENANT_ALREADY_EXISTS' };

  const pastedApiKey = (formData.get('apiKey') as string | null)?.trim() ?? '';
  if (!pastedApiKey) return { error: 'API_KEY_REQUIRED' };

  let tenantInfo: Awaited<ReturnType<typeof getCurrentTenant>>;
  let apiIssuers: Awaited<ReturnType<typeof listTenantIssuers>>;
  try {
    tenantInfo = await getCurrentTenant({ apiKey: pastedApiKey });
    apiIssuers = await listTenantIssuers({ apiKey: pastedApiKey });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  if (apiIssuers.length === 0) return { error: 'NO_ISSUERS_FOUND' };

  const apiTenantId = Number(tenantInfo.id);
  const alreadyLinked = await db.tenant.findUnique({ where: { apiTenantId } });
  if (alreadyLinked) return { error: 'TENANT_ALREADY_LINKED' };

  let newKey: Awaited<ReturnType<typeof createTenantApiKey>>;
  try {
    newKey = await createTenantApiKey(
      { apiKey: pastedApiKey },
      'Comprobify Web',
      tenantInfo.sandbox ? 'sandbox' : 'production',
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  const defaultIssuer = apiIssuers[0];
  const environment = tenantInfo.sandbox ? 'sandbox' : 'production';

  let defaultLocalIssuerId: number;
  try {
    defaultLocalIssuerId = await db.$transaction(async (tx): Promise<number> => {
      const tenant = await tx.tenant.create({
        data: {
          apiTenantId,
          ruc: defaultIssuer.ruc,
          businessName: defaultIssuer.businessName,
          tradeName: defaultIssuer.tradeName,
          environment,
          status: 'ACTIVE', // createTenantApiKey already required tenant.status === ACTIVE
        },
      });

      await tx.tenantApiKey.create({
        data: {
          tenantId: tenant.id,
          apiKeyId: newKey.id,
          label: newKey.label,
          environment: newKey.environment,
          encryptedKey: encrypt(newKey.key),
          lastFour: lastFour(newKey.key),
          isActive: true,
        },
      });

      let firstLocalIssuerId: number | null = null;
      for (const apiIssuer of apiIssuers) {
        const issuer: { id: number } = await tx.issuer.create({
          data: {
            tenantId: tenant.id,
            apiIssuerId: Number(apiIssuer.id),
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

      return firstLocalIssuerId as number;
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  await writeCtxCookie({ issuerId: defaultLocalIssuerId, v: 1 });

  revalidatePath('/', 'layout');
  const locale = await getLocale();
  redirect({ href: '/dashboard', locale });
  return null;
}
