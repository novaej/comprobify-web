'use server';

import { db } from '@/lib/db';
import { requireContext } from '@/lib/context';
import { revalidatePath } from 'next/cache';

export type SavedClient = {
  id: number;
  idType: string;
  idNumber: string;
  name: string;
  email: string;
  address: string | null;
};

export type ClientInput = {
  idType: string;
  idNumber: string;
  name: string;
  email: string;
  address?: string;
};

export type ClientResult = { error: string } | null;

async function requireTenantId(): Promise<number> {
  const ctx = await requireContext({ skipIssuer: true });
  return ctx.tenant.id;
}

export async function createClientAction(input: ClientInput): Promise<ClientResult> {
  const tenantId = await requireTenantId();
  await db.client.create({
    data: {
      tenantId,
      idType: input.idType,
      idNumber: input.idNumber.trim(),
      name: input.name.trim(),
      email: input.email.trim(),
      address: input.address?.trim() || null,
    },
  });
  revalidatePath('/clients');
  return null;
}

export async function updateClientAction(id: number, input: ClientInput): Promise<ClientResult> {
  const tenantId = await requireTenantId();
  await db.client.updateMany({
    where: { id, tenantId },
    data: {
      idType: input.idType,
      idNumber: input.idNumber.trim(),
      name: input.name.trim(),
      email: input.email.trim(),
      address: input.address?.trim() || null,
    },
  });
  revalidatePath('/clients');
  return null;
}

export async function deleteClientAction(id: number): Promise<ClientResult> {
  const tenantId = await requireTenantId();
  await db.client.deleteMany({ where: { id, tenantId } });
  revalidatePath('/clients');
  return null;
}
