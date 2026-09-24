'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { registerTenant } from '@/lib/public-api';
import { listAdminApiKeys } from '@/lib/admin-api';
import { extractForwardedIp } from '@/lib/client-forwarding';
import { encrypt, lastFour } from '@/lib/crypto';
import { writeCtxCookie } from '@/lib/context-cookie';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';
import { parseIntendedPlan } from '@/lib/subscription-tiers';
import { isUuid } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';

export type OnboardingResult = { error: string } | null;

export async function bootstrapTenantAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user?.id || !isUuid(session.user.id)) return { error: 'UNAUTHORIZED' };

  const userId = session.user.id;
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
  // Required by POST /v1/register now (comprobify's ADR-035 — there's no
  // API-hosted verification page to fall back to any more), so a missing
  // NEXT_PUBLIC_APP_URL must fail fast here with a clear config error
  // instead of silently omitting the field and getting a generic
  // VALIDATION_FAILED back from the API.
  if (!appUrl) return { error: 'APP_URL_NOT_CONFIGURED' };
  const verificationRedirectUrl = `${appUrl}/${locale}/verify-email`;

  const reqHeaders = await headers();
  const clientHeaders = { forwardedIp: extractForwardedIp(reqHeaders) };

  let apiTenantId: string;
  let apiIssuerId: string;
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
      clientHeaders,
    );
    apiTenantId = result.tenantId;
    apiIssuerId = result.issuerId;
    plainApiKey = result.apiKey;
    isEmailVerified = result.isEmailVerified;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // Fetch key metadata to get the API-side key ID. POST /v1/register mints
  // this key `is_reserved` (comprobify migration 102 — see its own comment
  // in registration.service.js), so it's invisible to the tenant-facing
  // GET /v1/keys; resolve it via the admin listing instead, filtered by the
  // fixed label register() always uses so a concurrent per-role mint for
  // some other tenant can never be picked up by mistake.
  const adminKeys = await listAdminApiKeys(apiTenantId).catch(() => []);
  const keyRecord = adminKeys.find((k) => k.label === 'Initial master key' && k.environment === 'sandbox');
  if (!keyRecord) return { error: 'DB_WRITE_FAILED' };

  let newIssuerId: string;
  try {
    newIssuerId = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          apiTenantId,
          ruc,
          businessName,
          tradeName,
          environment: 'sandbox',
          status: isEmailVerified ? 'ACTIVE' : 'PENDING_VERIFICATION',
          intendedTier: intendedPlan?.tier,
          intendedBillingInterval: intendedPlan?.interval,
        },
      });

      await tx.tenantApiKey.create({
        data: {
          tenantId: tenant.id,
          apiKeyId: keyRecord.id,
          label: keyRecord.label ?? 'Initial sandbox key',
          environment: 'sandbox',
          encryptedKey: encrypt(plainApiKey),
          lastFour: lastFour(plainApiKey),
          isActive: true,
          isManaged: true, // this becomes the tenant's master key — see resolveApiKeyForRole
          scopes: keyRecord.scopes,
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
    // Sentry is a no-op locally (no DSN), so log too — otherwise this failure is
    // invisible in dev and the user only sees the generic DB_WRITE_FAILED copy.
    console.error('[onboarding] tenant bootstrap transaction failed', err);
    Sentry.captureException(err, { extra: { apiTenantId } });
    return { error: 'DB_WRITE_FAILED' };
  }

  // Write the context cookie after the transaction commits — cookie writes are
  // not transactional and must not be inside $transaction or a failure would
  // silently roll back all the DB writes above.
  await writeCtxCookie({ issuerId: newIssuerId, v: 2 });

  revalidatePath('/', 'layout');
  // Always redirect to /agreements so the tenant can review and formally accept
  // their personalized legal documents (generated fire-and-forget during registration).
  // The /agreements page lazily triggers document generation on first load, so timing
  // with the async registration task is not a concern.
  redirect({ href: '/agreements', locale });
  return null;
}
