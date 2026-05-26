'use server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { registerTenant } from '@/lib/public-api';
import { listTenantApiKeys } from '@/lib/api';
import { encrypt, lastFour } from '@/lib/crypto';
import { writeCtxCookie } from '@/lib/context-cookie';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';

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

  if (!ruc || !businessName) return { error: 'REQUIRED_FIELDS' };

  const certFile = formData.get('cert') as File | null;
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

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
      },
      p12Buffer,
      certPassword,
      verificationRedirectUrl,
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
        },
      });

      await tx.tenantApiKey.create({
        data: {
          tenantId: tenant.id,
          apiKeyId: Number(keyRecord.id),
          label: keyRecord.label,
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
  } catch {
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
