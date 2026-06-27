'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import {
  createIssuer,
  updateIssuer,
  removeIssuer,
  activateIssuer,
  getIssuerSequentials,
  setIssuerSequential,
  addIssuerDocumentType,
  removeIssuerDocumentType,
  uploadIssuerLogo,
  renewIssuerCertificate,
  type ApiIssuerSequential,
} from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type IssuersResult = { error: string } | null;

/**
 * Creates a new issuer row — either a new branch (new branchCode) or a new
 * issue point under an existing branch (same branchCode, new issuePointCode).
 * Both go through the same POST /v1/issuers call; the API distinguishes them
 * by whether branchCode already exists for the tenant (see issuer.service.js
 * tier-limit checks: maxBranches vs maxIssuePointsPerBranch).
 *
 * sourceIssuerId is always resolved and sent, even when uploading a fresh P12 —
 * the API's createBranch controller sets sourceIssuer to null when a cert file
 * is present and no sourceIssuerId is given, but issuerService.createBranch
 * unconditionally reads sourceIssuer.ruc/business_name/etc. for the new row,
 * which would throw if sourceIssuer were null. Always passing it sidesteps that.
 */
export async function createBranchAction(formData: FormData): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const mode = (formData.get('mode') as string | null) === 'issuePoint' ? 'issuePoint' : 'branch';
  const issuePointCode = ((formData.get('issuePointCode') as string | null)?.trim() || '').slice(0, 3);
  const branchAddress = (formData.get('branchAddress') as string | null)?.trim() || undefined;
  const documentTypes = formData.getAll('documentTypes').map((v) => String(v)).filter(Boolean);

  const sourceLocalIssuerId = (formData.get('sourceLocalIssuerId') as string | null)?.trim();
  const sourceIssuer = sourceLocalIssuerId
    ? await db.issuer.findFirst({ where: { id: Number(sourceLocalIssuerId), tenantId: ctx.tenant.id, active: true } })
    : await db.issuer.findFirst({
        where: { tenantId: ctx.tenant.id, active: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
  if (!sourceIssuer) return { error: 'ISSUER_NOT_FOUND' };

  const branchCode = mode === 'issuePoint'
    ? sourceIssuer.branchCode
    : ((formData.get('branchCode') as string | null)?.trim() || '').slice(0, 3);

  if (!branchCode || !issuePointCode) return { error: 'REQUIRED_FIELDS' };

  const certFile = formData.get('cert') as File | null;
  const p12Buffer = certFile && certFile.size > 0 ? Buffer.from(await certFile.arrayBuffer()) : undefined;
  const certPassword = (formData.get('certPassword') as string | null) || undefined;

  let apiIssuer;
  try {
    apiIssuer = await createIssuer(
      { apiKey: ctx.apiKey },
      {
        sourceIssuerId: sourceIssuer.apiIssuerId,
        branchCode,
        issuePointCode,
        branchAddress,
        documentTypes: documentTypes.length > 0 ? documentTypes : undefined,
      },
      p12Buffer,
      certPassword,
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  // Trust the API's response for businessName/tradeName/branchAddress rather
  // than form input — the API always inherits these from the source issuer
  // regardless of what's sent, so writing form input here could silently
  // diverge from what the API actually stored.
  await db.issuer.create({
    data: {
      tenantId: ctx.tenant.id,
      apiIssuerId: Number(apiIssuer.id), // API returns bigint as JSON string
      branchCode: apiIssuer.branchCode,
      issuePointCode: apiIssuer.issuePointCode,
      businessName: apiIssuer.businessName,
      tradeName: apiIssuer.tradeName,
      branchAddress: apiIssuer.branchAddress,
      isDefault: false,
    },
  });

  revalidatePath('/issuers');
  revalidatePath('/', 'layout');
  return null;
}

export async function updateIssuerAction(
  issuerId: number,
  fields: { tradeName?: string; branchAddress?: string },
): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  let apiIssuer;
  try {
    apiIssuer = await updateIssuer({ apiKey: ctx.apiKey }, issuer.apiIssuerId, fields);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.issuer.update({
    where: { id: issuerId },
    data: { tradeName: apiIssuer.tradeName, branchAddress: apiIssuer.branchAddress },
  });

  revalidatePath('/issuers');
  revalidatePath(`/issuers/${issuerId}`);
  return null;
}

/**
 * Soft-deletes an issuer. The API itself refuses to remove the tenant's last
 * active issuer or one that has ever issued a document (LAST_ISSUER_CANNOT_BE_REMOVED /
 * ISSUER_HAS_DOCUMENTS) — this just surfaces those codes, then mirrors the
 * deactivation locally and re-points isDefault if the removed issuer held it.
 */
export async function removeIssuerAction(issuerId: number): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  try {
    await removeIssuer({ apiKey: ctx.apiKey }, issuer.apiIssuerId);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.issuer.update({ where: { id: issuerId }, data: { active: false } });

  if (issuer.isDefault) {
    const next = await db.issuer.findFirst({
      where: { tenantId: ctx.tenant.id, active: true, id: { not: issuerId } },
      orderBy: { createdAt: 'asc' },
    });
    if (next) {
      await db.issuer.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  revalidatePath('/issuers');
  revalidatePath('/', 'layout');
  return null;
}

/**
 * Reactivates a previously soft-deleted issuer. The API re-runs the same
 * branch/issue-point plan-limit checks as creation (BRANCH_LIMIT_REACHED /
 * ISSUE_POINT_LIMIT_REACHED), so this can fail if the tenant is currently at
 * or over their plan's cap.
 */
export async function activateIssuerAction(issuerId: number): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  try {
    await activateIssuer({ apiKey: ctx.apiKey }, issuer.apiIssuerId);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.issuer.update({ where: { id: issuerId }, data: { active: true } });

  revalidatePath('/issuers');
  revalidatePath('/', 'layout');
  return null;
}

export async function getIssuerSequentialsAction(
  issuerId: number,
): Promise<{ sequentials: ApiIssuerSequential[] } | { error: string }> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  try {
    const sequentials = await getIssuerSequentials({ apiKey: ctx.apiKey }, issuer.apiIssuerId);
    return { sequentials };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function setIssuerSequentialAction(
  issuerId: number,
  documentType: string,
  environment: 'sandbox' | 'production',
  nextSequential: number,
): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  if (!issuer || issuer.tenantId !== ctx.tenant.id) return { error: 'ISSUER_NOT_FOUND' };

  try {
    await setIssuerSequential({ apiKey: ctx.apiKey }, issuer.apiIssuerId, documentType, environment, nextSequential);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath(`/issuers/${issuerId}`);
  return null;
}

export async function addDocumentTypeAction(issuerId: number, code: string): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

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
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

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
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

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
  revalidatePath(`/issuers/${issuerId}`);
  return null;
}

export async function renewIssuerCertificateAction(issuerId: number, formData: FormData): Promise<IssuersResult> {
  const ctx = await requirePermission('issuers.manage', { skipIssuer: true });

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
  revalidatePath(`/issuers/${issuerId}`);
  return null;
}
