'use server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export type CatalogProduct = {
  id: number;
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

async function requireUserId(): Promise<number | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return Number(session.user.id);
}

export async function listProductsAction(): Promise<CatalogProduct[]> {
  const userId = await requireUserId();
  if (!userId) return [];
  const rows = await db.product.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, mainCode: true, auxCode: true, description: true, unitPrice: true, taxOption: true },
  });
  return rows.map((r) => ({ ...r, unitPrice: r.unitPrice.toString() }));
}

export async function createProductAction(input: CatalogProductInput): Promise<CatalogResult> {
  const userId = await requireUserId();
  if (!userId) return { error: 'UNAUTHORIZED' };
  await db.product.create({
    data: {
      userId,
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

export async function updateProductAction(id: number, input: CatalogProductInput): Promise<CatalogResult> {
  const userId = await requireUserId();
  if (!userId) return { error: 'UNAUTHORIZED' };
  await db.product.updateMany({
    where: { id, userId },
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

export async function deleteProductAction(id: number): Promise<CatalogResult> {
  const userId = await requireUserId();
  if (!userId) return { error: 'UNAUTHORIZED' };
  await db.product.deleteMany({ where: { id, userId } });
  revalidatePath('/catalog');
  return null;
}
