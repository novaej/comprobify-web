'use server';

import { db } from '@/lib/db';
import { requirePermission } from '@/lib/context';
import { revalidatePath } from 'next/cache';

export type CatalogProduct = {
  id: string;
  mainCode: string;
  auxCode: string | null;
  description: string;
  unitPrice: string;
  taxOption: string;
};

export type CatalogProductInput = {
  mainCode: string;
  auxCode?: string;
  description: string;
  unitPrice: string;
  taxOption: string;
};

export type CatalogResult = { error: string } | null;

async function requireTenantId(): Promise<string> {
  const ctx = await requirePermission('catalog.manage', { skipIssuer: true });
  return ctx.tenant.id;
}

export async function listProductsAction(): Promise<CatalogProduct[]> {
  const tenantId = await requireTenantId();
  const rows = await db.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, mainCode: true, auxCode: true, description: true, unitPrice: true, taxOption: true },
  });
  return rows.map((r) => ({ ...r, unitPrice: r.unitPrice.toString() }));
}

export async function createProductAction(input: CatalogProductInput): Promise<CatalogResult> {
  const tenantId = await requireTenantId();
  await db.product.create({
    data: {
      tenantId,
      mainCode: input.mainCode.trim().slice(0, 25),
      auxCode: input.auxCode?.trim().slice(0, 25) || null,
      description: input.description.trim(),
      unitPrice: input.unitPrice,
      taxOption: input.taxOption,
    },
  });
  revalidatePath('/catalog');
  return null;
}

export async function updateProductAction(id: string, input: CatalogProductInput): Promise<CatalogResult> {
  const tenantId = await requireTenantId();
  await db.product.updateMany({
    where: { id, tenantId },
    data: {
      mainCode: input.mainCode.trim().slice(0, 25),
      auxCode: input.auxCode?.trim().slice(0, 25) || null,
      description: input.description.trim(),
      unitPrice: input.unitPrice,
      taxOption: input.taxOption,
    },
  });
  revalidatePath('/catalog');
  return null;
}

export async function deleteProductAction(id: string): Promise<CatalogResult> {
  const tenantId = await requireTenantId();
  await db.product.deleteMany({ where: { id, tenantId } });
  revalidatePath('/catalog');
  return null;
}
