'use server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
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

async function requireUserId(): Promise<number | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return Number(session.user.id);
}

export async function createClientAction(input: ClientInput): Promise<ClientResult> {
  const userId = await requireUserId();
  if (!userId) return { error: 'UNAUTHORIZED' };
  await db.client.create({
    data: {
      userId,
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
  const userId = await requireUserId();
  if (!userId) return { error: 'UNAUTHORIZED' };
  await db.client.updateMany({
    where: { id, userId },
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
  const userId = await requireUserId();
  if (!userId) return { error: 'UNAUTHORIZED' };
  await db.client.deleteMany({ where: { id, userId } });
  revalidatePath('/clients');
  return null;
}
