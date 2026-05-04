'use server';

import { db } from '@/lib/db';
import { registerIssuer, promoteToProduction, resendVerificationEmail, listDocumentTypes, IssuerRegistrationFields } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import { auth } from '@/auth';
import { ApiError } from '@/lib/errors';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { headers } from 'next/headers';

async function buildVerifyEmailUrl(locale: string): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || 'localhost:3000';
  const proto = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}/${locale}/verify-email`;
}

export type SettingsResult = { error: string } | { verified: true } | null;

export async function setupIssuerAction(formData: FormData): Promise<SettingsResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { error: 'UNAUTHORIZED' };
  const userId = Number(session.user.id);

  const certFile = formData.get('cert') as File | null;
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const certPassword = (formData.get('certPassword') as string) ?? '';
  const fields: IssuerRegistrationFields = {
    ruc: (formData.get('ruc') as string).trim(),
    businessName: (formData.get('businessName') as string).trim(),
    tradeName: (formData.get('tradeName') as string | null)?.trim() || undefined,
    mainAddress: (formData.get('mainAddress') as string | null)?.trim() || undefined,
    branchCode: ((formData.get('branchCode') as string) || '001').trim(),
    issuePointCode: ((formData.get('issuePointCode') as string) || '001').trim(),
    emissionType: '1',
    requiredAccounting: formData.get('requiredAccounting') === 'on',
    initialSequentials: ['01', '04', '05', '06', '07']
      .flatMap((code) => {
        const raw = formData.get(`seq_${code}`);
        const seq = raw !== null ? parseInt(raw as string, 10) : NaN;
        return !isNaN(seq) && seq >= 1 ? [{ documentType: code, sequential: seq }] : [];
      }),
  };
  fields.documentTypes = fields.initialSequentials!.map((e) => e.documentType);

  if (!fields.ruc || !fields.businessName) return { error: 'REQUIRED_FIELDS' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());
  const locale = await getLocale();
  const verificationRedirectUrl = await buildVerifyEmailUrl(locale);

  let issuerId: number;
  let apiKey: string;
  let isEmailVerified: boolean;
  try {
    ({ issuerId, apiKey, isEmailVerified } = await registerIssuer(session.user.email, fields, p12Buffer, certPassword, verificationRedirectUrl));
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) return { error: 'SUSPENDED' };
      if (err.status === 409) return { error: 'CONFLICT' };
      if (err.status === 429) return { error: 'TOO_MANY_REQUESTS' };
      const msg = err.detail.toLowerCase();
      if (msg.includes('expired')) return { error: 'CERT_EXPIRED' };
      if (msg.includes('signing key') || msg.includes('invalid') || msg.includes('password')) return { error: 'CERT_INVALID' };
      return { error: err.code };
    }
    console.error('Unexpected error in setupIssuerAction:', err);
    return { error: 'UNEXPECTED_ERROR' };
  }

  // Log credentials before the DB write so they are always recoverable from
  // server logs even if the write below fails.
  console.info(`[setupIssuer] userId=${userId} issuerId=${issuerId} apiKey=${apiKey}`);

  try {
    await db.user.update({
      where: { id: userId },
      data: { comprobifyApiKey: apiKey, comprobifyIssuerId: issuerId, emailVerified: isEmailVerified },
    });
  } catch (err) {
    console.error(`[setupIssuer] DB write failed after successful API registration. userId=${userId} issuerId=${issuerId} apiKey=${apiKey}`, err);
    return { error: 'DB_WRITE_FAILED' };
  }

  redirect({ href: '/dashboard', locale });
  return null;
}

export async function promoteToProductionAction(
  initialSequentials: { documentType: string; sequential: number }[] = [],
): Promise<SettingsResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'UNAUTHORIZED' };
  if (session.user.environment === 'production') return { error: 'ALREADY_PRODUCTION' };

  let newApiKey: string;
  try {
    const currentApiKey = await requireApiKey();
    newApiKey = await promoteToProduction(currentApiKey, initialSequentials);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) return { error: 'EMAIL_NOT_VERIFIED' };
      if (err.status === 409) return { error: 'ALREADY_PRODUCTION' };
      return { error: err.code };
    }
    throw err;
  }

  await db.user.update({
    where: { id: Number(session.user.id) },
    data: { comprobifyApiKey: newApiKey, environment: 'production', emailVerified: true },
  });

  const locale = await getLocale();
  redirect({ href: '/settings', locale });
  return null;
}

export async function resendVerificationAction(): Promise<SettingsResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) return { error: 'UNAUTHORIZED' };

  try {
    await resendVerificationEmail(session.user.email);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        // Email is already verified — update local DB and signal the client
        await db.user.update({
          where: { id: Number(session.user.id) },
          data: { emailVerified: true },
        });
        return { verified: true };
      }
      if (err.status === 429) return { error: 'TOO_MANY_REQUESTS' };
      return { error: err.code };
    }
    console.error('Unexpected error in resendVerificationAction:', err);
    return { error: 'UNEXPECTED_ERROR' };
  }

  return null;
}
