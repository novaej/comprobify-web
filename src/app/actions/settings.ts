'use server';

import { db } from '@/lib/db';
import { adminCreateIssuer, adminPromoteIssuer, adminCreateApiKey, IssuerFields } from '@/lib/admin-api';
import { auth } from '@/auth';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

export type SettingsResult = { error: string } | null;

export async function setupIssuerAction(formData: FormData): Promise<SettingsResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'UNAUTHORIZED' };
  const userId = Number(session.user.id);

  const certFile = formData.get('cert') as File | null;
  if (!certFile || certFile.size === 0) return { error: 'CERT_REQUIRED' };

  const certPassword = (formData.get('certPassword') as string) ?? '';
  const fields: IssuerFields = {
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
    const result = await adminCreateIssuer(fields, p12Buffer, certPassword);
    issuerId = result.issuer.id;
    apiKey = result.apiKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('expired')) return { error: 'CERT_EXPIRED' };
    if (msg.toLowerCase().includes('locate signing key') || msg.toLowerCase().includes('invalid')) return { error: 'CERT_INVALID' };
    if (msg.toLowerCase().includes('already exists')) return { error: 'RUC_CONFLICT' };
    return { error: 'ISSUER_SETUP_FAILED' };
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
  const userId = Number(session.user.id);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { comprobifyIssuerId: true, environment: true },
  });

  if (!user?.comprobifyIssuerId) return { error: 'ISSUER_NOT_CONFIGURED' };
  if (user.environment === 'production') return { error: 'ALREADY_PRODUCTION' };

  try {
    await adminPromoteIssuer(user.comprobifyIssuerId);
    const newApiKey = await adminCreateApiKey(user.comprobifyIssuerId, 'Production key');
    await db.user.update({
      where: { id: userId },
      data: { comprobifyApiKey: newApiKey, environment: 'production' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('already in production')) return { error: 'ALREADY_PRODUCTION' };
    return { error: 'PROMOTE_FAILED' };
  }

  const locale = await getLocale();
  redirect({ href: '/settings', locale });
  return null;
}
