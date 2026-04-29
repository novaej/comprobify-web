'use server';

import { db } from '@/lib/db';
import { registerIssuer, promoteToProduction, IssuerRegistrationFields } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import { auth } from '@/auth';
import { ApiError } from '@/lib/errors';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

export type SettingsResult = { error: string } | null;

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
    requiredAccounting: formData.get('requiredAccounting') === 'true',
  };

  if (!fields.ruc || !fields.businessName) return { error: 'REQUIRED_FIELDS' };

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

  let issuerId: number;
  let apiKey: string;
  try {
    ({ issuerId, apiKey } = await registerIssuer(session.user.email, fields, p12Buffer, certPassword));
  } catch (err) {
    if (err instanceof ApiError) {
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

  await db.user.update({
    where: { id: userId },
    data: { comprobifyApiKey: apiKey, comprobifyIssuerId: issuerId },
  });

  const locale = await getLocale();
  redirect({ href: '/dashboard', locale });
  return null;
}

export async function promoteToProductionAction(): Promise<SettingsResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'UNAUTHORIZED' };
  if (session.user.environment === 'production') return { error: 'ALREADY_PRODUCTION' };

  let newApiKey: string;
  try {
    const currentApiKey = await requireApiKey();
    newApiKey = await promoteToProduction(currentApiKey);
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
    data: { comprobifyApiKey: newApiKey, environment: 'production' },
  });

  const locale = await getLocale();
  redirect({ href: '/settings', locale });
  return null;
}
