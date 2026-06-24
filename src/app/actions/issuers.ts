'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { createIssuer, addIssuerDocumentType, removeIssuerDocumentType, uploadIssuerLogo, renewIssuerCertificate } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type IssuersResult = { error: string } | null;

export async function createBranchAction(formData: FormData): Promise<IssuersResult> {
  await requirePermission('issuers.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const branchCode = ((formData.get('branchCode') as string | null)?.trim() || '').slice(0, 3);
  const issuePointCode = ((formData.get('issuePointCode') as string | null)?.trim() || '').slice(0, 3);
  const businessName = (formData.get('businessName') as string | null)?.trim() ?? ctx.tenant.businessName;
  const tradeName = (formData.get('tradeName') as string | null)?.trim() || undefined;
  const branchAddress = (formData.get('branchAddress') as string | null)?.trim() || undefined;

  if (!branchCode || !issuePointCode) return { error: 'REQUIRED_FIELDS' };

  const certFile = formData.get('cert') as File | null;
  const p12Buffer = certFile && certFile.size > 0 ? Buffer.from(await certFile.arrayBuffer()) : undefined;
  const certPassword = (formData.get('certPassword') as string | null) || undefined;

  let apiIssuer;
  try {
    apiIssuer = await createIssuer(
      { apiKey: ctx.apiKey },
      { ruc: ctx.tenant.ruc, businessName, tradeName, branchCode, issuePointCode, emissionType: '1', requiredAccounting: false },
      p12Buffer,
      certPassword,
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.issuer.create({
    data: {
      tenantId: ctx.tenant.id,
      apiIssuerId: Number(apiIssuer.id), // API returns bigint as JSON string
      branchCode,
      issuePointCode,
      businessName,
      tradeName,
      branchAddress,
      isDefault: false,
    },
  });

  revalidatePath('/issuers');
  return null;
}

export async function addDocumentTypeAction(issuerId: number, code: string): Promise<IssuersResult> {
  await requirePermission('issuers.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  try {
    await addIssuerDocumentType({ apiKey: ctx.apiKey }, issuer.apiIssuerId, code);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/issuers');
  return null;
}

export async function removeDocumentTypeAction(issuerId: number, code: string): Promise<IssuersResult> {
  await requirePermission('issuers.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  try {
    await removeIssuerDocumentType({ apiKey: ctx.apiKey }, issuer.apiIssuerId, code);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/issuers');
  return null;
}

export async function updateIssuerLogoAction(issuerId: number, formData: FormData): Promise<IssuersResult> {
  await requirePermission('issuers.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  const logoFile = formData.get('logo') as File | null;
  if (!logoFile || logoFile.size === 0) return { error: 'INVALID_FILE_UPLOAD' };

  const logoBuffer = Buffer.from(await logoFile.arrayBuffer());

  try {
    await uploadIssuerLogo({ apiKey: ctx.apiKey }, issuer.apiIssuerId, logoBuffer, logoFile.type);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/issuers');
  return null;
}

export async function renewIssuerCertificateAction(issuerId: number, formData: FormData): Promise<IssuersResult> {
  await requirePermission('issuers.manage', { skipIssuer: true });
  const ctx = await (await import('@/lib/context')).requireContext({ skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  const certFile = formData.get('cert') as File | null;
  if (!certFile || certFile.size === 0) return { error: 'INVALID_FILE_UPLOAD' };
  const certPassword = (formData.get('certPassword') as string | null) || undefined;

  const p12Buffer = Buffer.from(await certFile.arrayBuffer());

  try {
    await renewIssuerCertificate({ apiKey: ctx.apiKey }, issuer.apiIssuerId, p12Buffer, certPassword);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/issuers');
  return null;
}
